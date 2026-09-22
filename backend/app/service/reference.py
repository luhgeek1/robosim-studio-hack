from collections import defaultdict
from collections.abc import Sequence
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.models import Norm, NormSet, ObjectType, ParameterDef, ProcessDef, Source
from app.db.repositories.reference import ReferenceRepository
from app.db.repositories.sources import to_source
from app.db.uow import UnitOfWork
from app.domain.common.provenance import Provenance, PValue
from app.domain.reference import (
    CrossCheck,
    DemoProjectRef,
    Industry,
    LaborGroupDef,
    NormCategory,
    NormInfo,
    NormSetInfo,
    ObjectTypeDetail,
    ObjectTypeKey,
    ParameterDef as ParameterDefInfo,
    ParameterGroup,
    ProcessDef as ProcessDefInfo,
    Requirement,
    SiteCostDef,
    SizingModel,
    SolutionTypeInfo,
    SpecGroup,
    SpecKeyInfo,
)


def _default(param: ParameterDef, sources: dict[UUID, Source]) -> PValue | None:
    if param.default_status is None:
        return None
    source = sources.get(param.default_source_id) if param.default_source_id else None
    return PValue(
        value=param.default_value,
        unit=param.unit,
        provenance=Provenance(
            status=param.default_status, source=to_source(source) if source else None, note=param.default_note
        ),
    )


def _parameter(param: ParameterDef, sources: dict[UUID, Source]) -> ParameterDefInfo:
    return ParameterDefInfo(
        key=param.key,
        name=param.name,
        group=param.group_key,
        type=param.type,
        unit=param.unit,
        required=param.required,
        min=param.min_value,
        max=param.max_value,
        step=param.step,
        enum_values=param.enum_values,
        default=_default(param, sources),
        hint=param.hint,
        example=param.example,
        affects=param.affects,
        order=param.order,
        dataset_row=param.dataset_row,
    )


def _process(process: ProcessDef) -> ProcessDefInfo:
    return ProcessDefInfo(
        key=process.key,
        name=process.name,
        description=process.description,
        demand_unit=process.demand_unit,
        demand_formula=process.demand_formula,
        demand_params=process.demand_params,
        sla=process.sla,
        labor_groups=process.labor_groups,
        solution_types=process.solution_types,
        sizing_model=process.sizing_model,
        demand=process.demand,
        labor_allocation=process.labor_allocation,
        labor_allocation_note=process.labor_allocation_note,
        route_length=process.route_length,
        unit_weight=process.unit_weight,
        requirements=[Requirement(**item) for item in process.requirements],
        labor_release=process.labor_release,
        labor_release_by_type=process.labor_release_by_type,
    )


def _object_type(
    item: ObjectType,
    params: Sequence[ParameterDef],
    processes: Sequence[ProcessDef],
    sources: dict[UUID, Source],
) -> ObjectTypeDetail:
    by_group: dict[str, list[ParameterDefInfo]] = defaultdict(list)
    for param in params:
        by_group[param.group_key].append(_parameter(param, sources))
    groups = [
        ParameterGroup(
            key=g["key"], name=g["name"], order=g.get("order", 0), parameters=by_group.get(g["key"], [])
        )
        for g in sorted(item.parameter_groups, key=lambda group: group.get("order", 0))
    ]
    return ObjectTypeDetail(
        key=ObjectTypeKey(item.key),
        name=item.name,
        description=item.description,
        industry=item.industry,
        depth=item.depth,
        parameter_groups=groups,
        processes=[_process(p) for p in processes],
        labor_groups=[LaborGroupDef(**g) for g in item.labor_groups],
        layout_templates=item.layout_templates,
        demo_projects=[DemoProjectRef(**d) for d in item.demo_projects],
        checks=[CrossCheck(**c) for c in item.checks],
        site_costs=[SiteCostDef(**c) for c in item.site_costs],
    )


def _norm(norm: Norm, sources: dict[UUID, Source]) -> NormInfo:
    return NormInfo(
        key=norm.key,
        name=norm.name,
        value=norm.value,
        unit=norm.unit,
        category=NormCategory(norm.category),
        range_min=norm.range_min,
        range_max=norm.range_max,
        source=to_source(sources[norm.source_id]),
        rationale=norm.rationale,
        affects=norm.affects,
        editable_by_user=norm.editable_by_user,
        object_types=norm.object_types,
    )


def _norm_set(norm_set: NormSet, count: int) -> NormSetInfo:
    return NormSetInfo(
        version=norm_set.version,
        published_at=norm_set.published_at,
        published_by=norm_set.published_by,
        notes=norm_set.notes,
        norms_count=count,
        is_current=norm_set.is_current,
    )


class ReferenceService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._repo = ReferenceRepository(uow.session)

    async def _details(self, items: Sequence[ObjectType]) -> list[ObjectTypeDetail]:
        keys = [item.key for item in items]
        params = await self._repo.parameters(keys)
        processes = await self._repo.processes(keys)
        sources = await self._repo.sources({p.default_source_id for p in params if p.default_source_id})
        return [
            _object_type(
                item,
                [p for p in params if p.object_type == item.key],
                [p for p in processes if p.object_type == item.key],
                sources,
            )
            for item in items
        ]

    async def object_types(self) -> list[ObjectTypeDetail]:
        return await self._details(await self._repo.object_types())

    async def object_type(self, key: str) -> ObjectTypeDetail:
        item = await self._repo.object_type(key)
        if item is None:
            raise NotFoundError("Тип объекта не найден")
        return (await self._details([item]))[0]

    async def solution_types(
        self, object_type: str | None, process_key: str | None
    ) -> list[SolutionTypeInfo]:
        processes = await self._repo.processes(
            [object_type] if object_type else [t.value for t in ObjectTypeKey]
        )
        if process_key:
            processes = [p for p in processes if p.key == process_key]
        used_by: dict[str, list[str]] = defaultdict(list)
        for process in processes:
            for key in process.solution_types:
                if process.key not in used_by[key]:
                    used_by[key].append(process.key)
        counts = await self._repo.products_per_solution_type()
        filtered = bool(object_type or process_key)
        return [
            SolutionTypeInfo(
                key=item.key,
                name=item.name,
                description=item.description,
                sizing_model=SizingModel(item.sizing_model) if item.sizing_model else None,
                capability_keys=item.capability_keys,
                processes=used_by.get(item.key, []),
                products_count=counts.get(item.key, 0),
            )
            for item in await self._repo.solution_types()
            if not filtered or item.key in used_by
        ]

    async def spec_keys(self) -> list[SpecKeyInfo]:
        return [
            SpecKeyInfo(
                key=item.key,
                name=item.name,
                group=SpecGroup(item.group),
                unit=item.unit,
                value_type=item.value_type,
                better=item.better,
                is_key_constraint=item.is_key_constraint,
                solution_types=item.solution_types,
            )
            for item in await self._repo.spec_keys()
        ]

    async def industries(self) -> list[Industry]:
        return [
            Industry(key=item.key, name=item.name, products_count=count)
            for item, count in await self._repo.industries_with_counts()
        ]

    async def norms(
        self, version: str | None, category: str | None, object_type: str | None
    ) -> tuple[str, list[NormInfo]]:
        norm_set = await self._repo.norm_set(version)
        if norm_set is None:
            raise NotFoundError("Набор нормативов не найден")
        norms = await self._repo.norms(norm_set.id, category, object_type)
        sources = await self._repo.sources({norm.source_id for norm in norms})
        return norm_set.version, [_norm(norm, sources) for norm in norms]

    async def norm_sets(self) -> list[NormSetInfo]:
        return [_norm_set(item, count) for item, count in await self._repo.norm_sets_with_counts()]

    async def data_version(self, key: str) -> str | None:
        return await self._repo.data_version(key)

    async def current_norm_set_version(self) -> str | None:
        norm_set = await self._repo.norm_set(None)
        return norm_set.version if norm_set else None
