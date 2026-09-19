"""Business-rule validation on top of the canonical parameters (plain code, no LLM)."""

from __future__ import annotations

from ..schemas import ParameterValue, ValidationIssue


def _v(params: dict[str, ParameterValue], key: str, default=None):
    p = params.get(key)
    return p.value if p and p.value is not None else default


def validate_warehouse(params: dict[str, ParameterValue]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for key in ("area_m2", "robotized_area_m2", "aisle_width_m", "daily_pallets_in", "daily_pallets_out", "avg_pallet_weight_kg", "budget_mln", "target_sla_percent"):
        p = params.get(key)
        if p is None or p.value is None:
            issues.append(ValidationIssue(key=key, level="error", message=f"Обязательный параметр «{p.label if p else key}» отсутствует"))
    area, zone = _v(params, "area_m2"), _v(params, "robotized_area_m2")
    if area and zone and zone > area:
        issues.append(ValidationIssue(key="robotized_area_m2", level="error", message="Роботизируемая зона больше общей площади склада"))
    aisle = _v(params, "aisle_width_m")
    if aisle and aisle < 1.5:
        issues.append(ValidationIssue(key="aisle_width_m", level="warning", message="Проходы уже 1,5 м: подходят только узкопроходные решения"))
    if not _v(params, "has_wms", False):
        issues.append(ValidationIssue(key="has_wms", level="error", message="Без WMS роботизация паллетного потока невозможна: роботам нужен источник заданий"))
    peak = _v(params, "peak_factor")
    if peak and peak > 2.2:
        issues.append(ValidationIssue(key="peak_factor", level="warning", message="Очень высокий пиковый коэффициент: расчёт количества роботов будет консервативным"))
    for p in params.values():
        if p.out_of_range:
            issues.append(ValidationIssue(key=p.key, level="warning", message=f"{p.label}: {p.value} {p.unit} вне типового диапазона"))
    return issues


def validate(object_type: str, params: dict[str, ParameterValue]) -> list[ValidationIssue]:
    if object_type == "warehouse":
        return validate_warehouse(params)
    issues = [ValidationIssue(key=p.key, level="warning", message=f"{p.label}: вне типового диапазона") for p in params.values() if p.out_of_range]
    missing = [p for p in params.values() if p.required and p.value is None]
    issues += [ValidationIssue(key=p.key, level="error", message=f"Обязательный параметр «{p.label}» отсутствует") for p in missing]
    return issues
