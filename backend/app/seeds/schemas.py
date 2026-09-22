from datetime import date
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, TypeAdapter

from app.domain.catalog import Badge
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.domain.reference import NormCategory, ObjectTypeKey, SizingModel, SpecGroup

DATA_DIR = Path(__file__).resolve().parent / "data"


class SeedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SolutionTypeSeed(SeedModel):
    key: str
    name: str
    description: str | None = None
    sizing_model: SizingModel | None
    capability_keys: list[str] = []


class SpecKeySeed(SeedModel):
    key: str
    name: str
    group: SpecGroup
    unit: str | None = None
    value_type: Literal["number", "string", "boolean"]
    better: Literal["higher", "lower", "none"] = "none"
    is_key_constraint: bool = False
    solution_types: list[str] = []


class DefaultSeed(SeedModel):
    value: Any
    status: Literal[ProvenanceStatus.ASSUMPTION, ProvenanceStatus.DERIVED]
    rationale: str


class ParameterSeed(SeedModel):
    key: str
    group: str
    name: str
    type: Literal["number", "integer", "string", "boolean", "enum", "dimensions"]
    unit: str | None = None
    required: bool = False
    dataset_row: str | None = None
    step: float | None = None
    min: float | None = None
    max: float | None = None
    enum_values: list[dict[str, str]] | None = None
    hint: str | None = None
    example: str | None = None
    affects: list[str] = []
    order: int = 0
    default: DefaultSeed | None = None


class ParameterGroupSeed(SeedModel):
    key: str
    name: str
    order: int = 0


class LaborGroupSeed(SeedModel):
    key: str
    name: str
    headcount_param: str
    salary_param: str | None = None


class DemandSeed(SeedModel):
    per_day: str
    hours_per_day: str
    peak_factor: str


class RequirementSeed(SeedModel):
    key: str
    spec: str
    comparison: Literal["gte", "lte"]
    required: str
    unit: str | None = None
    solution_types: list[str] = []
    message: str
    why_needed: str


class ProcessSeed(SeedModel):
    key: str
    name: str
    description: str | None = None
    demand_unit: Literal["pallet", "line", "item", "m2", "trip", "kg", "bag", "portion", "container"]
    demand_formula: str | None = None
    demand_params: list[str] = []
    sla: dict[str, Any] | None = None
    labor_groups: list[str] = []
    solution_types: list[str] = []
    sizing_model: SizingModel | None = None
    demand: DemandSeed | None = None
    labor_allocation: dict[str, float] = {}
    labor_allocation_note: str | None = None
    route_length: str | None = None
    unit_weight: str | None = None
    requirements: list[RequirementSeed] = []


class CheckSeed(SeedModel):
    key: str
    expression: str
    severity: Literal["error", "warning", "info"]
    params: list[str]
    message: str
    how_to_fix: str | None = None


class DemoProjectSeed(SeedModel):
    key: str
    name: str
    description: str | None = None


class ObjectTypeSeed(SeedModel):
    key: ObjectTypeKey
    name: str
    description: str | None = None
    industry: str
    depth: Literal["full", "basic"]
    dataset_sheet: str | None = None
    layout_templates: list[str] = []
    parameter_groups: list[ParameterGroupSeed]
    parameters: list[ParameterSeed]
    labor_groups: list[LaborGroupSeed] = []
    processes: list[ProcessSeed] = []
    checks: list[CheckSeed] = []
    demo_projects: list[DemoProjectSeed] = []


class SourceSeed(SeedModel):
    key: str
    kind: SourceKind
    title: str
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None


class RangeSeed(SeedModel):
    min: float | None = None
    max: float | None = None


class NormSeed(SeedModel):
    key: str
    name: str
    value: float
    unit: str
    category: NormCategory
    range: RangeSeed | None = None
    source: str
    rationale: str | None = None
    affects: list[str] = []
    editable_by_user: bool = True
    object_types: list[ObjectTypeKey] = []


class NormSetSeed(SeedModel):
    version: str
    notes: str | None = None
    sources: list[SourceSeed]
    norms: list[NormSeed]


class ProductMappingSeed(SeedModel):
    id: str
    name: str
    solution_type: str
    object_types: list[ObjectTypeKey] = []
    processes: list[str] = []
    specs_ref: str | None = None
    badges: list[Literal[Badge.IN_REGISTRY_719, Badge.TESTED_FCBAS]] = []
    website: str | None = None
    note: str | None = None


class CatalogMappingSeed(SeedModel):
    industry_keys: dict[str, str]
    subtype_synonyms: dict[str, str] = {}
    extra_solution_types: list[SolutionTypeSeed] = []
    products: list[ProductMappingSeed]


def load_yaml[T](path: Path, model: type[T]) -> T:
    with path.open(encoding="utf-8") as handle:
        return TypeAdapter(model).validate_python(yaml.safe_load(handle))


def load_solution_types() -> list[SolutionTypeSeed]:
    return load_yaml(DATA_DIR / "solution_types.yaml", list[SolutionTypeSeed])


def load_spec_keys() -> list[SpecKeySeed]:
    return load_yaml(DATA_DIR / "spec_keys.yaml", list[SpecKeySeed])


def load_object_types() -> list[ObjectTypeSeed]:
    items = [load_yaml(path, ObjectTypeSeed) for path in (DATA_DIR / "object_types").glob("*.yaml")]
    order = list(ObjectTypeKey)
    return sorted(items, key=lambda item: order.index(item.key))


def load_norm_set(version: str = "v1") -> NormSetSeed:
    return load_yaml(DATA_DIR / f"norms_{version}.yaml", NormSetSeed)


def load_catalog_mapping() -> CatalogMappingSeed:
    return load_yaml(DATA_DIR / "catalog_mapping.yaml", CatalogMappingSeed)
