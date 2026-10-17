import hashlib
import json
from dataclasses import asdict
from typing import TYPE_CHECKING, Any

from app.core.versions import ENGINE_VERSION
from app.domain.scenario.models import CountMode

if TYPE_CHECKING:
    from app.db.models import ScenarioItem
    from app.service.scenarios.snapshot import Snapshot

PHYSICAL_NORM_CATEGORIES = frozenset({"sizing", "operations", "layout", "simulation"})
PHYSICAL_NORM_KEYS = frozenset({"robots_per_charging_station"})
EVIDENCE_VERSION = "joint-fleet-v1"
FINANCIAL_PARAM_KEYS = frozenset({"horizon_years", "payroll_tax_coeff", "working_days_per_year"})


def _monetary(key: str, unit: str | None) -> bool:
    return "rub" in key or any(token in (unit or "").lower() for token in ("₽", "руб", "rub"))


def physical_fingerprint(snapshot: "Snapshot") -> str:
    """Bind evidence to the whole physical configuration; price/financing edits do not change it."""
    inp = snapshot.input
    labor_params = {
        key for group in inp.labor_groups for key in (group.headcount_param, group.salary_param) if key
    }
    processes = {process.key: process for process in inp.processes}
    engine_items = {item.process_key: item for item in inp.items}
    items: list[dict[str, Any]] = []
    for item in sorted(snapshot.scenario.items, key=lambda row: row.process_key):
        engine_item = engine_items[item.process_key]
        process = asdict(processes[item.process_key])
        items.append(
            {
                "process_key": item.process_key,
                "product_id": str(item.product_id),
                "solution_type": engine_item.solution_type,
                "sizing_model": engine_item.sizing_model,
                "count_mode": item.count_mode,
                "count_manual": item.count_manual if item.count_mode == CountMode.MANUAL else None,
                "simulated_count": item.simulated_count if item.count_mode == CountMode.AUTO else None,
                "stations_mode": item.stations_mode,
                "stations_count": item.stations_count if item.stations_mode == CountMode.MANUAL else None,
                "throughput_override": item.throughput_override_per_hour,
                "specs": {
                    key: quantity.value
                    for key, quantity in engine_item.specs.items.items()
                    if not _monetary(key, quantity.unit)
                },
                "process": {
                    key: value
                    for key, value in process.items()
                    if not key.startswith(("labor", "manual_"))
                    and key not in {"name", "description", "order"}
                },
            }
        )
    payload = {
        "evidence_version": EVIDENCE_VERSION,
        "engine_version": ENGINE_VERSION,
        "object_type": inp.object_type,
        "params": {
            key: value
            for key, value in inp.params.items()
            if key not in labor_params | FINANCIAL_PARAM_KEYS and not _monetary(key, inp.param_meta[key].unit)
        },
        "norms": {
            key: quantity.value
            for key, quantity in inp.norms.items.items()
            if key in PHYSICAL_NORM_KEYS
            or (key in snapshot.norm_rows and snapshot.norm_rows[key].category in PHYSICAL_NORM_CATEGORIES)
        },
        "layout": snapshot.physical_layout,
        "layout_quantities": {key: value.value for key, value in inp.layout.items.items()},
        "items": items,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(encoded.encode()).hexdigest()


def simulated_count(item: "ScenarioItem", fingerprint: str) -> int | None:
    if item.count_mode != CountMode.AUTO or not item.simulated_count or not item.simulation_id:
        return None
    return item.simulated_count if item.simulated_fingerprint == fingerprint else None
