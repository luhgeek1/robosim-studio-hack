"""Robot matching: hard constraints, then explainable scoring (PROJECT_CONTEXT §8)."""

from __future__ import annotations

from ..models import Robot
from ..schemas import Check, MatchResult
from .catalog import spec_value, to_out, data_quality
from .economics import fleet_capex
from .site import Site
from .sizing import effective_throughput, required_count

SAFETY_MARGIN_M = 0.5
WEIGHTS = {"throughput": 0.25, "cost": 0.25, "infrastructure": 0.15, "maturity": 0.15, "data_quality": 0.10, "references": 0.10}
STATUS_FACTOR = {"operation": 1.0, "piloting": 0.8, "rnd": 0.5}


def _fmt(v: float, d: int = 1) -> str:
    return f"{v:,.{d}f}".replace(",", " ").replace(".", ",")


def hard_checks(robot: Robot, site: Site) -> list[Check]:
    checks: list[Check] = []
    unit_type = spec_value(robot, "unit_type", "pallet")
    checks.append(Check(criterion="Тип груза", passed=unit_type == "pallet", hard=True,
                        text="Перемещает паллеты" if unit_type == "pallet" else "Не работает с паллетами: другой тип груза"))
    payload = float(spec_value(robot, "payload_kg", 0))
    need = site.pallet_weight_kg * 1.5
    checks.append(Check(criterion="Грузоподъёмность", passed=payload >= need, hard=True,
                        text=f"Грузоподъёмность {_fmt(payload, 0)} кг покрывает паллеты до {_fmt(need, 0)} кг (средняя {_fmt(site.pallet_weight_kg, 0)} кг)" if payload >= need
                        else f"Грузоподъёмность {_fmt(payload, 0)} кг ниже требуемых {_fmt(need, 0)} кг для тяжёлых паллет"))
    width = float(spec_value(robot, "width_m", 1.0))
    min_aisle = float(spec_value(robot, "min_aisle_m", width + SAFETY_MARGIN_M))
    need_aisle = max(min_aisle, width + SAFETY_MARGIN_M)
    checks.append(Check(criterion="Ширина проходов", passed=need_aisle <= site.aisle_width_m, hard=True,
                        text=f"Проходит по проходам {_fmt(site.aisle_width_m)} м — роботу достаточно {_fmt(need_aisle)} м" if need_aisle <= site.aisle_width_m
                        else f"Нужны проходы от {_fmt(need_aisle)} м, на складе {_fmt(site.aisle_width_m)} м"))
    flat_max = float(spec_value(robot, "floor_flatness_max_mm", 5))
    checks.append(Check(criterion="Пол", passed=site.floor_flatness_mm <= flat_max, hard=True,
                        text="Ровность пола достаточна" if site.floor_flatness_mm <= flat_max else f"Требуется пол ровнее {_fmt(flat_max, 0)} мм/2м"))
    trl = robot.trl or 0
    checks.append(Check(criterion="Зрелость", passed=trl >= 7, hard=True,
                        text=f"Серийное решение, УГТ {trl}" if trl >= 7 else f"Решение на стадии разработки (УГТ {trl})"))
    return checks


def soft_checks(robot: Robot, site: Site, eff: float, n: int, capex: float) -> list[Check]:
    checks: list[Check] = []
    checks.append(Check(criterion="Производительность", passed=n <= 6,
                        text=f"{n} робота дают {_fmt(eff * n * (1 - 0.06 * (n - 1)), 0)} паллет/ч — выше пиковых {_fmt(site.peak_rate, 0)}"))
    checks.append(Check(criterion="Бюджет", passed=capex <= site.budget_mln,
                        text=f"Конфигурация {_fmt(capex)} млн ₽ укладывается в бюджет {_fmt(site.budget_mln, 0)} млн ₽" if capex <= site.budget_mln
                        else f"Конфигурация {_fmt(capex)} млн ₽ выше бюджета {_fmt(site.budget_mln, 0)} млн ₽"))
    marking = bool(spec_value(robot, "needs_floor_marking", False))
    checks.append(Check(criterion="Инфраструктура", passed=not marking,
                        text="Работает без разметки пола: " + str(spec_value(robot, "navigation", "SLAM")) if not marking
                        else "Нужна разметка пола: +0,9 млн ₽ и остановка зоны на 3 дня"))
    checks.append(Check(criterion="Интеграция с WMS", passed=site.wms_api_known,
                        text="Версия API WMS известна" if site.wms_api_known else "Требуется подтвердить интеграцию с WMS: версия API не указана в данных"))
    if site.nonstandard_share > 10:
        checks.append(Check(criterion="Нестандартные грузы", passed=False, text=f"{_fmt(site.nonstandard_share, 0)} % грузов останутся на ручной обработке"))
    return checks


def match(robots: list[Robot], site: Site) -> list[MatchResult]:
    prelim = []
    for r in robots:
        hc = hard_checks(r, site)
        eligible = all(c.passed for c in hc)
        eff = effective_throughput(r, site)
        n = required_count(eff, site) if eff > 0 else 0
        capex = fleet_capex(r, n, site)["total"] if n else 0.0
        prelim.append((r, hc, eligible, eff, n, capex))
    elig = [p for p in prelim if p[2] and p[4] > 0]
    max_eff = max((p[3] for p in elig), default=1)
    min_capex = min((p[5] for p in elig), default=1)
    out: list[MatchResult] = []
    for r, hc, eligible, eff, n, capex in prelim:
        sc = soft_checks(r, site, eff, n, capex) if eligible and n else []
        q, _ = data_quality(r)
        refs = int(spec_value(r, "references", 0))
        s = {
            "throughput": (eff / max_eff) if max_eff else 0,
            "cost": (min_capex / capex) if capex else 0,
            "infrastructure": 0.6 if spec_value(r, "needs_floor_marking", False) else 1.0,
            "maturity": min(1.0, (r.trl or 0) / 9) * STATUS_FACTOR.get(r.status, 0.6),
            "data_quality": {"high": 1.0, "medium": 0.7, "low": 0.4}[q],
            "references": 1.0 if refs >= 10 else 0.75 if refs >= 3 else 0.5 if r.cases else 0.3,
        }
        score = sum(WEIGHTS[k] * v for k, v in s.items())
        if capex > site.budget_mln:
            score *= 0.85
        compat = round(100 * score) if eligible else round(100 * score * 0.55)
        fits = [c.text for c in hc + sc if c.passed]
        risks = [c.text for c in hc + sc if not c.passed]
        summary = _summary(r, eligible, n, capex, site, hc)
        out.append(MatchResult(robot=to_out(r), eligible=eligible, compatibility=compat, score_breakdown={k: round(v, 2) for k, v in s.items()},
                               fits=fits, risks=risks, checks=hc + sc, required_count=n, effective_throughput=eff, fleet_capex_mln=round(capex, 1), summary=summary))
    out.sort(key=lambda m: (not m.eligible, -m.compatibility))
    return out


def _summary(r: Robot, eligible: bool, n: int, capex: float, site: Site, hc: list[Check]) -> str:
    if not eligible:
        failed = [c.text for c in hc if not c.passed]
        return "Не подходит: " + failed[0].lower() if failed else "Не подходит."
    parts = [f"Нужно {n} робота, конфигурация {_fmt(capex)} млн ₽."]
    if capex > site.budget_mln:
        parts.append("Выходит за бюджет.")
    if spec_value(r, "needs_floor_marking", False):
        parts.append("Требует разметки пола.")
    return " ".join(parts)
