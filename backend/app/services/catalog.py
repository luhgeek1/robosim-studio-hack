"""Robot catalog: rows from catalog_export_v4.csv + curated numeric specs.

The CSV has descriptive data only (type, scenario, price, TRL, cases). Numbers the engines
need (payload, footprint, speed, throughput, battery, navigation, aisle requirement) are
curated here with a source and confidence, following the RobotSpecification idea from
PROJECT_CONTEXT.md §25. Values marked is_assumption=True are estimates, not vendor data.
"""

from __future__ import annotations

import csv
import re
from typing import Any

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Robot
from ..schemas import RobotOut, RobotSpec

DOCX = "ТТХ из «Примеры решений по типам объектов»"
CSV_SRC = "catalog_export_v4.csv"
EST = "оценка RoboScope по классу решения"


def _s(value: Any, unit: str = "", source: str = DOCX, confidence: float = 0.9, assumption: bool = False) -> dict:
    return {"value": value, "unit": unit, "source": source, "confidence": confidence, "is_assumption": assumption}


def _amr(payload, width, length, speed, thr, battery, charge, nav, marking, min_aisle, src=EST, conf=0.7, lift=0.0, unit_type="pallet", refs=0, lead=10, flat=5, tmin=5, tmax=25):
    a = src == EST
    return {
        "payload_kg": _s(payload, "кг", src, conf, a),
        "width_m": _s(width, "м", src, conf, a),
        "length_m": _s(length, "м", src, conf, a),
        "speed_mps": _s(speed, "м/с", src, conf, a),
        "throughput_pallets_h": _s(thr, "паллет/ч", EST, 0.65, True),
        "battery_hours": _s(battery, "ч", src, conf, a),
        "charge_min": _s(charge, "мин", src, conf, a),
        "navigation": _s(nav, "", src, conf, a),
        "needs_floor_marking": _s(marking, "", src, conf, a),
        "min_aisle_m": _s(min_aisle, "м", EST, 0.7, True),
        "lift_height_m": _s(lift, "м", src, conf, a),
        "unit_type": _s(unit_type, "", CSV_SRC, 0.9, False),
        "references": _s(refs, "внедрений", CSV_SRC, 0.8, refs == 0),
        "lead_weeks": _s(lead, "нед.", EST, 0.6, True),
        "floor_flatness_max_mm": _s(flat, "мм/2м", EST, 0.6, True),
        "temp_min_c": _s(tmin, "°C", src, conf, a),
        "temp_max_c": _s(tmax, "°C", src, conf, a),
    }


# keyed by the beginning of the CSV «Название»
CURATED: dict[str, dict] = {
    "Ronavi H1500": _amr(1500, 0.654, 1.044, 1.5, 58, 6, 18, "QR + SLAM", False, 2.0, DOCX, 0.92, refs=48, lead=10),
    "Ronavi H2000": _amr(2000, 0.8, 1.25, 1.5, 50, 6, 18, "QR + SLAM", False, 2.2, EST, 0.7, refs=6, lead=12),
    "Ronavi M (": _amr(1200, 0.7, 1.1, 1.4, 48, 6, 20, "QR + SLAM", False, 2.0, EST, 0.65, refs=2, lead=12),
    "AMR 1500": _amr(1500, 0.9, 1.4, 1.2, 42, 8, 60, "SLAM", False, 2.4, EST, 0.6, refs=3, lead=8),
    "AMR 800": _amr(800, 0.8, 1.2, 1.2, 40, 8, 60, "SLAM", False, 2.2, EST, 0.6, refs=3, lead=8),
    "DMR 1200": _amr(1200, 0.9, 1.5, 1.2, 45, 8, 90, "QR-сетка", True, 2.4, EST, 0.65, refs=4, lead=8),
    "DMR Carrier P": _amr(1500, 1.2, 2.0, 1.5, 45, 10, 90, "SLAM (лидар)", False, 2.6, DOCX, 0.85, lift=1.6, refs=5, lead=8),
    "AK-2000-2": _amr(2000, 1.2, 2.2, 1.3, 35, 9, 90, "SLAM (лидар)", False, 2.8, EST, 0.6, lift=1.8, refs=12, lead=10),
    "Робот-штабелёр RoboCV": _amr(1400, 1.3, 2.4, 1.2, 30, 9, 90, "лидар + магнитные метки", True, 3.2, EST, 0.55, lift=4.5, refs=4, lead=14),
    "Сёмабот": _amr(1500, 0.8, 1.2, 1.2, 40, 6, 30, "SLAM", False, 2.2, EST, 0.5, refs=0, lead=12),
    "MULE": _amr(1500, 1.1, 2.0, 1.2, 35, 8, 90, "SLAM (лидар)", False, 2.8, EST, 0.55, lift=1.6, refs=1, lead=12),
    "Беспилотный погрузчик": _amr(1500, 1.3, 2.6, 1.2, 32, 8, 120, "лидар", False, 3.5, EST, 0.5, lift=3.0, refs=1, lead=16),
    "Робот-тягач RoboCV": _amr(3000, 0.9, 1.8, 1.5, 0, 9, 90, "лидар", False, 2.4, EST, 0.55, unit_type="cart", refs=6, lead=12),
    "Ronavi SR": _amr(50, 0.5, 0.7, 2.0, 0, 8, 20, "QR", True, 1.0, EST, 0.7, unit_type="parcel", refs=10),
    "Ronavi SD": _amr(10, 0.4, 0.42, 2.5, 0, 10, 30, "QR", True, 0.7, DOCX, 0.9, unit_type="tote", refs=5),
    "AMR 100": _amr(100, 0.6, 0.8, 1.5, 0, 8, 60, "SLAM", False, 1.2, EST, 0.6, unit_type="tote", refs=2),
    "SmartCube": _amr(30, 0.6, 0.6, 1.0, 0, 8, 60, "рельсы", True, 0.0, EST, 0.5, unit_type="tote", refs=2),
}


def _num(s: str | None) -> float | None:
    if not s:
        return None
    s = s.replace(" ", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _short(name: str) -> str:
    return re.sub(r"\s*\(.*?\)\s*", "", name).strip()


def load_catalog(db: Session) -> int:
    """Idempotent import of the CSV into the robots table."""
    if not settings.catalog_csv.exists():
        return 0
    seen: set[str] = set()
    n = 0
    with open(settings.catalog_csv, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            name = row.get("Название", "").strip()
            company = row.get("компания", "").strip().strip('"')
            key = (name, company)
            if not name or key in seen:
                continue
            seen.add(key)
            specs = next((v for k, v in CURATED.items() if name.startswith(k)), {})
            trl = _num(row.get("УГТ"))
            r = db.get(Robot, row["id"]) or Robot(id=row["id"])
            r.name, r.short_name, r.vendor = name, _short(name), company.replace('""', '"')
            r.kind, r.status = row.get("тип", ""), row.get("статус", "")
            r.category, r.subtype, r.scenario = row.get("Тип", ""), row.get("Подтип", ""), row.get("Сценарий", "")
            r.cases, r.description = row.get("Кейсы", ""), row.get("описание", "")
            r.trl = int(trl) if trl is not None else None
            r.market_potential = _num(row.get("Рын Потенциал"))
            r.region, r.industry = row.get("Регион", ""), row.get("Отрасль", "")
            r.price_rub = _num(row.get("Цена изделия"))
            r.specs = specs
            db.add(r)
            n += 1
    db.commit()
    return n


def spec_value(robot: Robot, key: str, default=None):
    s = robot.specs.get(key)
    return s["value"] if s else default


def data_quality(robot: Robot) -> tuple[str, str]:
    if not robot.specs:
        return "low", "Только описательные данные каталога, без ТТХ"
    confs = [s.get("confidence", 0.5) for s in robot.specs.values()]
    avg = sum(confs) / len(confs)
    assumed = sum(1 for s in robot.specs.values() if s.get("is_assumption"))
    if avg >= 0.8 and assumed <= 5:
        return "high", "ТТХ подтверждены документацией производителя"
    if avg >= 0.62:
        return "medium", f"Часть характеристик оценочные ({assumed} из {len(confs)})"
    return "low", "Предварительная спецификация, требует уточнения у поставщика"


def to_out(robot: Robot) -> RobotOut:
    q, ql = data_quality(robot)
    return RobotOut(
        id=robot.id, name=robot.name, short_name=robot.short_name, vendor=robot.vendor, category=robot.category,
        subtype=robot.subtype, scenario=robot.scenario, status=robot.status, trl=robot.trl,
        price_mln=round(robot.price_rub / 1e6, 2) if robot.price_rub else None, description=robot.description, cases=robot.cases,
        specs={k: RobotSpec(**v) for k, v in robot.specs.items()}, data_quality=q, data_quality_label=ql,
    )


def warehouse_candidates(db: Session) -> list[Robot]:
    rows = db.query(Robot).all()
    return [r for r in rows if r.specs and ("логист" in r.scenario.lower() or "склад" in r.scenario.lower())]
