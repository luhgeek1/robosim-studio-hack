from datetime import datetime

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.common import PValue, Source
from app.domain.reference import (
    NormCategory,
    NormInfo,
    NormSetInfo,
    ObjectTypeDetail,
    ObjectTypeKey,
    ParameterDef as ParameterDefInfo,
    ProcessDef as ProcessDefInfo,
    SizingModel,
    SolutionTypeInfo,
    SpecGroup,
    SpecKeyInfo,
)


class EnumValue(ApiModel):
    value: str
    label: str


class ParameterDef(ApiModel):
    key: str
    name: str
    group: str
    type: str
    unit: str | None = None
    required: bool
    min: float | None = None
    max: float | None = None
    step: float | None = None
    enum_values: list[EnumValue] = Field(default_factory=list)
    default: PValue | None = None
    hint: str | None = None
    example: str | None = None
    affects: list[str] = Field(default_factory=list)
    order: int = 0

    @classmethod
    def from_domain(cls, item: ParameterDefInfo) -> "ParameterDef":
        return cls(
            **{
                name: getattr(item, name)
                for name in cls.model_fields
                if name not in {"default", "enum_values"}
            },
            enum_values=[EnumValue(value=v["value"], label=v["label"]) for v in item.enum_values],
            default=PValue.from_domain(item.default) if item.default else None,
        )


class ParameterGroup(ApiModel):
    key: str
    name: str
    order: int = 0
    parameters: list[ParameterDef]


class Sla(ApiModel):
    kind: str | None = None
    target_value: float | None = None
    unit: str | None = None
    target_param: str | None = None


class ProcessDef(ApiModel):
    key: str
    name: str
    description: str | None = None
    demand_unit: str
    demand_formula: str | None = None
    sla: Sla | None = None
    labor_groups: list[str] = Field(default_factory=list)
    solution_types: list[str]
    sizing_model: SizingModel | None = None

    @classmethod
    def from_domain(cls, item: ProcessDefInfo) -> "ProcessDef":
        return cls(
            key=item.key,
            name=item.name,
            description=item.description,
            demand_unit=item.demand_unit,
            demand_formula=item.demand_formula,
            sla=Sla(**item.sla) if item.sla else None,
            labor_groups=item.labor_groups,
            solution_types=item.solution_types,
            sizing_model=item.sizing_model,
        )


class DemoProject(ApiModel):
    key: str
    name: str
    description: str | None = None


class ObjectType(ApiModel):
    key: ObjectTypeKey
    name: str
    description: str | None = None
    industry: str
    depth: str
    demo_projects: list[DemoProject] = Field(default_factory=list)
    parameter_groups: list[ParameterGroup]
    processes: list[ProcessDef]
    layout_templates: list[str] = Field(default_factory=list)

    @classmethod
    def from_domain(cls, item: ObjectTypeDetail) -> "ObjectType":
        return cls(
            key=item.key,
            name=item.name,
            description=item.description,
            industry=item.industry,
            depth=item.depth,
            demo_projects=[
                DemoProject(key=d.key, name=d.name, description=d.description) for d in item.demo_projects
            ],
            parameter_groups=[
                ParameterGroup(
                    key=g.key,
                    name=g.name,
                    order=g.order,
                    parameters=[ParameterDef.from_domain(p) for p in g.parameters],
                )
                for g in item.parameter_groups
            ],
            processes=[ProcessDef.from_domain(p) for p in item.processes],
            layout_templates=item.layout_templates,
        )


class ObjectTypeList(ApiModel):
    items: list[ObjectType]


class SolutionType(ApiModel):
    key: str
    name: str
    description: str | None = None
    sizing_model: SizingModel | None = None
    capability_keys: list[str]
    processes: list[str] = Field(default_factory=list)
    products_count: int = 0

    @classmethod
    def from_domain(cls, item: SolutionTypeInfo) -> "SolutionType":
        return cls.model_validate(item)


class SolutionTypeList(ApiModel):
    items: list[SolutionType]


class Industry(ApiModel):
    key: str
    name: str
    products_count: int = 0


class IndustryList(ApiModel):
    items: list[Industry]


class NormRange(ApiModel):
    min: float | None = None
    max: float | None = None


class Norm(ApiModel):
    key: str
    name: str
    value: float
    unit: str
    category: NormCategory
    range: NormRange | None = None
    source: Source
    rationale: str | None = None
    affects: list[str] = Field(default_factory=list)
    editable_by_user: bool
    object_types: list[ObjectTypeKey] = Field(default_factory=list)

    @classmethod
    def from_domain(cls, item: NormInfo) -> "Norm":
        has_range = item.range_min is not None or item.range_max is not None
        return cls(
            key=item.key,
            name=item.name,
            value=item.value,
            unit=item.unit,
            category=item.category,
            range=NormRange(min=item.range_min, max=item.range_max) if has_range else None,
            source=Source.from_domain(item.source),
            rationale=item.rationale,
            affects=item.affects,
            editable_by_user=item.editable_by_user,
            object_types=[ObjectTypeKey(t) for t in item.object_types],
        )


class NormList(ApiModel):
    version: str
    items: list[Norm]


class NormSet(ApiModel):
    version: str
    published_at: datetime
    published_by: str | None = None
    notes: str | None = None
    norms_count: int
    is_current: bool = False

    @classmethod
    def from_domain(cls, item: NormSetInfo) -> "NormSet":
        return cls.model_validate(item)


class NormSetList(ApiModel):
    items: list[NormSet]


class SpecKey(ApiModel):
    key: str
    name: str
    group: SpecGroup
    unit: str | None = None
    is_key_constraint: bool = False
    solution_types: list[str] = Field(default_factory=list)

    @classmethod
    def from_domain(cls, item: SpecKeyInfo) -> "SpecKey":
        return cls(
            key=item.key,
            name=item.name,
            group=item.group,
            unit=item.unit,
            is_key_constraint=item.is_key_constraint,
            solution_types=item.solution_types,
        )


class SpecKeyList(ApiModel):
    items: list[SpecKey]
