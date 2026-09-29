from typing import Any

from sqlalchemy import delete, tuple_
from sqlalchemy.dialects.postgresql import insert

from app.core.config import Settings
from app.db.models import Industry, ObjectType, ParameterDef, ProcessDef, SolutionType, SpecKey
from app.db.uow import UnitOfWork
from app.domain.common.provenance import ProvenanceStatus
from app.domain.layout.models import RouteKey
from app.domain.project.params import DIMENSION_PARTS
from app.engine.expressions import ExpressionError, parse
from app.seeds.dataset import DatasetRow, read_dataset
from app.seeds.schemas import (
    ObjectTypeSeed,
    ParameterSeed,
    load_catalog_mapping,
    load_norm_set,
    load_object_types,
    load_solution_types,
    load_spec_keys,
)
from app.seeds.sources import SourceRegistry, dataset_sheet_source, team_assumption_source


class SeedDataError(ValueError):
    pass


async def _upsert(uow: UnitOfWork, model: Any, rows: list[dict[str, Any]], keys: list[str]) -> None:
    if not rows:
        return
    statement = insert(model).values(rows)
    updated = {column: statement.excluded[column] for column in rows[0] if column not in keys}
    await uow.session.execute(statement.on_conflict_do_update(index_elements=keys, set_=updated))


async def seed_solution_types(uow: UnitOfWork, _: Settings) -> int:
    in_scope = load_solution_types()
    extra = load_catalog_mapping().extra_solution_types
    rows = [
        {
            "key": item.key,
            "name": item.name,
            "description": item.description,
            "sizing_model": item.sizing_model,
            "capability_keys": item.capability_keys,
            "in_scope": index < len(in_scope),
            "order": index,
        }
        for index, item in enumerate([*in_scope, *extra])
    ]
    await _upsert(uow, SolutionType, rows, ["key"])
    return len(rows)


async def seed_spec_keys(uow: UnitOfWork, _: Settings) -> int:
    rows = [{**item.model_dump(), "order": index} for index, item in enumerate(load_spec_keys())]
    await _upsert(uow, SpecKey, rows, ["key"])
    return len(rows)


async def seed_industries(uow: UnitOfWork, _: Settings) -> int:
    mapping = load_catalog_mapping().industry_keys
    await _upsert(uow, Industry, [{"key": key, "name": name} for name, key in mapping.items()], ["key"])
    return len(mapping)


_TEXT_TYPES = frozenset({"string", "enum", "dimensions"})


def dataset_default(param: ParameterSeed, cell: DatasetRow) -> Any:
    """Text fields keep the cell text («Да (ЕМИАС)»); enums store the value whose label matches the cell.

    A yes/no parameter whose cell states a requirement instead of «Да» («EASA/ИКАО», «Обязательно для
    Б-маршрутов») means «yes, required»; the text itself stays in the dataset note of the value."""
    if param.type == "boolean" and isinstance(cell.value, str):
        return True
    if param.type not in _TEXT_TYPES:
        return cell.value
    text = (cell.raw_value or "").strip() or None
    if param.type == "enum" and text is not None:
        by_label = {item["label"].strip().lower(): item["value"] for item in param.enum_values or []}
        if text.lower() not in by_label:
            raise SeedDataError(f"{param.key}: dataset value {text!r} matches no enum label")
        return by_label[text.lower()]
    return text


async def _parameter_row(
    object_type: ObjectTypeSeed,
    param: ParameterSeed,
    dataset: dict[str, DatasetRow],
    sources: SourceRegistry,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "object_type": object_type.key.value,
        "key": param.key,
        "group_key": param.group,
        "name": param.name,
        "type": param.type,
        "unit": param.unit,
        "required": param.required,
        "min_value": param.min,
        "max_value": param.max,
        "step": param.step,
        "enum_values": param.enum_values or [],
        "default_value": None,
        "default_status": None,
        "default_source_id": None,
        "default_note": None,
        "dataset_row": param.dataset_row,
        "hint": param.hint,
        "example": param.example,
        "affects": param.affects,
        "order": param.order,
    }
    if param.dataset_row is not None:
        cell = dataset.get(param.dataset_row)
        if cell is None:
            raise SeedDataError(f"{object_type.key}: dataset row not found: {param.dataset_row!r}")
        row.update(
            unit=param.unit or cell.unit,
            min_value=param.min if param.min is not None else cell.min,
            max_value=param.max if param.max is not None else cell.max,
            default_value=dataset_default(param, cell),
            default_status=ProvenanceStatus.DEFAULT,
            default_source_id=await sources.id_for(dataset_sheet_source(cell.sheet)),
            default_note=cell.note,
        )
    elif param.default is not None:
        row.update(
            default_value=param.default.value,
            default_status=param.default.status,
            default_source_id=await sources.id_for(team_assumption_source("parameters")),
            default_note=param.default.rationale,
        )
    return row


_MAX_ALLOCATION = 1.0


def _expression_problems(where: str, source: str, names: set[str]) -> list[str]:
    try:
        unknown = sorted(parse(source).names - names)
    except ExpressionError as exc:
        return [f"{where}: {exc}"]
    return [f"{where}: unknown names {unknown}"] if unknown else []


def _route_problems(object_type: ObjectTypeSeed, names: set[str]) -> list[str]:
    """Route and weight formulas may also read the layout's route lengths (`layout_route_*_m`)."""
    known = names | {key.param_key for key in RouteKey}
    problems: list[str] = []
    for process in object_type.processes:
        formulas = {"route_length": process.route_length, "unit_weight": process.unit_weight}
        if process.simulation is not None:
            formulas |= {f"simulation.{k}": v for k, v in process.simulation.formulas().items()}
        for where, formula in formulas.items():
            if formula:
                problems += _expression_problems(f"{process.key}.{where}", formula, known)
    return problems


def _rule_problems(object_type: ObjectTypeSeed, names: set[str]) -> list[str]:
    """Matching rules and per-trip operations are formulas too: every name must be a parameter or a norm."""
    problems: list[str] = []
    for process in object_type.processes:
        for rule in process.requirements:
            for field in ("required", "when", "condition"):
                if source := getattr(rule, field):
                    problems += _expression_problems(f"{process.key}.{rule.key}.{field}", source, names)
        for extra in process.cycle_extras:
            problems += _expression_problems(f"{process.key}.{extra.key}", extra.formula, names)
    return problems


def _formula_names(object_type: ObjectTypeSeed, norm_keys: set[str]) -> set[str]:
    """Parameters and norms; a dimensions parameter reads as its length, width and height (mm)."""
    names = {p.key for p in object_type.parameters} | norm_keys
    for param in object_type.parameters:
        if param.type == "dimensions":
            names |= {f"{param.key}_{part}" for part in DIMENSION_PARTS}
    return names


def _formula_problems(object_type: ObjectTypeSeed, norm_keys: set[str]) -> list[str]:
    names = _formula_names(object_type, norm_keys)
    problems = _route_problems(object_type, names) + _rule_problems(object_type, names)
    allocated: dict[str, float] = {}
    for process in object_type.processes:
        if process.demand is not None:
            for field in (
                "per_day",
                "hours_per_day",
                "peak_factor",
                "load_per_trip",
                "trip_tare_kg",
                "manual_rate",
            ):
                if getattr(process.demand, field):
                    problems += _expression_problems(
                        f"{process.key}.{field}", getattr(process.demand, field), names
                    )
        if process.labor_allocation and set(process.labor_allocation) != set(process.labor_groups):
            problems.append(f"{process.key}: labor_allocation keys differ from labor_groups")
        for group, share in process.labor_allocation.items():
            allocated[group] = allocated.get(group, 0.0) + share
        releases = {"*": process.labor_release} if process.labor_release else {}
        for where, formula in {**releases, **process.labor_release_by_type}.items():
            problems += _expression_problems(f"{process.key}.labor_release[{where}]", formula, names)
        problems += [
            f"{process.key}: labor_release_by_type for foreign solution type {t}"
            for t in process.labor_release_by_type
            if t not in process.solution_types
        ]
        if process.labor_allocation and not process.labor_release:
            problems.append(f"{process.key}: has labor but no labor_release")
    for cost in object_type.site_costs:
        problems += _expression_problems(f"site cost {cost.key}", cost.formula, names)
    problems += [
        f"labor {g}: allocated {v:.2f} > 1" for g, v in allocated.items() if v > _MAX_ALLOCATION + 1e-9
    ]
    for check in object_type.checks:
        problems += _expression_problems(f"check {check.key}", check.expression, names)
    return problems


def _validate(object_type: ObjectTypeSeed, solution_types: set[str], norm_keys: set[str]) -> None:
    params = {p.key for p in object_type.parameters}
    groups = {g.key for g in object_type.parameter_groups}
    labor = {g.key for g in object_type.labor_groups}
    problems = [
        f"param {p.key}: unknown group {p.group}" for p in object_type.parameters if p.group not in groups
    ]
    for group in object_type.labor_groups:
        refs = [group.headcount_param, *([group.salary_param] if group.salary_param else [])]
        problems += [f"labor {group.key}: unknown param {ref}" for ref in refs if ref not in params]
    for process in object_type.processes:
        problems += [
            f"process {process.key}: unknown param {p}" for p in process.demand_params if p not in params
        ]
        problems += [
            f"process {process.key}: unknown labor {g}" for g in process.labor_groups if g not in labor
        ]
        problems += [
            f"process {process.key}: unknown solution type {s}"
            for s in process.solution_types
            if s not in solution_types
        ]
    problems += [
        f"site cost {cost.key}: unknown solution type {s}"
        for cost in object_type.site_costs
        for s in cost.solution_types
        if s not in solution_types
    ]
    problems += [
        f"demo {demo.key}: unknown param {key}"
        for demo in object_type.demo_projects
        for key in demo.params
        if key not in params
    ]
    problems += _formula_problems(object_type, norm_keys)
    if problems:
        raise SeedDataError(f"{object_type.key}: " + "; ".join(problems))


async def seed_object_types(uow: UnitOfWork, settings: Settings) -> int:
    dataset = read_dataset(settings.data_root)
    solution_types = {item.key for item in load_solution_types()}
    norm_keys = {norm.key for norm in load_norm_set("v1").norms}
    sources = SourceRegistry(uow)
    count = 0
    for order, object_type in enumerate(load_object_types()):
        _validate(object_type, solution_types, norm_keys)
        key = object_type.key.value
        await _upsert(
            uow,
            ObjectType,
            [
                {
                    "key": key,
                    "name": object_type.name,
                    "description": object_type.description,
                    "industry": object_type.industry,
                    "depth": object_type.depth,
                    "dataset_sheet": object_type.dataset_sheet,
                    "parameter_groups": [g.model_dump() for g in object_type.parameter_groups],
                    "labor_groups": [g.model_dump() for g in object_type.labor_groups],
                    "layout_templates": object_type.layout_templates,
                    "checks": [c.model_dump() for c in object_type.checks],
                    "demo_projects": [d.model_dump() for d in object_type.demo_projects],
                    "site_costs": [c.model_dump() for c in object_type.site_costs],
                    "order": order,
                }
            ],
            ["key"],
        )
        sheet = dataset.get(object_type.dataset_sheet or "", {})
        params = [await _parameter_row(object_type, p, sheet, sources) for p in object_type.parameters]
        await _replace_children(uow, ParameterDef, key, params)
        processes = [
            {**p.model_dump(), "object_type": key, "order": index}
            for index, p in enumerate(object_type.processes)
        ]
        await _replace_children(uow, ProcessDef, key, processes)
        count += len(params) + len(processes)
    return count


async def _replace_children(
    uow: UnitOfWork, model: Any, object_type: str, rows: list[dict[str, Any]]
) -> None:
    """Upsert by (object_type, key) and drop rows that disappeared from the seed file."""
    keep = [(object_type, row["key"]) for row in rows]
    stale = delete(model).where(model.object_type == object_type)
    if keep:
        stale = stale.where(tuple_(model.object_type, model.key).not_in(keep))
    await uow.session.execute(stale)
    await _upsert(uow, model, rows, ["object_type", "key"])
