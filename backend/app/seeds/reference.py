from typing import Any

from sqlalchemy import delete, tuple_
from sqlalchemy.dialects.postgresql import insert

from app.core.config import Settings
from app.db.models import Industry, ObjectType, ParameterDef, ProcessDef, SolutionType, SpecKey
from app.db.uow import UnitOfWork
from app.domain.common.provenance import ProvenanceStatus
from app.seeds.dataset import DatasetRow, read_dataset
from app.seeds.schemas import (
    ObjectTypeSeed,
    ParameterSeed,
    load_catalog_mapping,
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
    """Text fields keep the cell text («Да (ЕМИАС)»); enums store the value whose label matches the cell."""
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


def _validate(object_type: ObjectTypeSeed, solution_types: set[str]) -> None:
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
    if problems:
        raise SeedDataError(f"{object_type.key}: " + "; ".join(problems))


async def seed_object_types(uow: UnitOfWork, settings: Settings) -> int:
    dataset = read_dataset(settings.data_root)
    solution_types = {item.key for item in load_solution_types()}
    sources = SourceRegistry(uow)
    count = 0
    for order, object_type in enumerate(load_object_types()):
        _validate(object_type, solution_types)
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
