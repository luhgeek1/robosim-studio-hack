from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from app.domain.common.provenance import Provenance, Scalar, SourceInfo
from app.domain.reference.models import SpecGroup


class ProductStatus(StrEnum):
    OPERATION = "operation"
    PILOTING = "piloting"
    RND = "rnd"


class Badge(StrEnum):
    IN_REGISTRY_719 = "in_registry_719"
    TESTED_FCBAS = "tested_fcbas"
    SPECS_CONFIRMED = "specs_confirmed"
    DOMESTIC = "domestic"
    HAS_CASES = "has_cases"


@dataclass(frozen=True, slots=True)
class Manufacturer:
    id: UUID
    name: str
    country: str
    region: str | None
    website: str | None


@dataclass(frozen=True, slots=True)
class SpecValue:
    key: str
    name: str
    group: SpecGroup
    value: Scalar
    unit: str | None
    provenance: Provenance
    is_key_constraint: bool
    is_primary: bool = True


@dataclass(frozen=True, slots=True)
class ProductOffer:
    id: UUID
    industry: str
    scenario: str
    price_rub: float
    vat_included: bool
    price_note: str
    cases_text: str | None
    source: SourceInfo


@dataclass(frozen=True, slots=True)
class ProductCase:
    customer: str
    count: int | None
    description: str | None
    year: int | None
    source: SourceInfo | None


@dataclass(frozen=True, slots=True)
class ProductSummary:
    id: UUID
    name: str
    manufacturer: Manufacturer
    solution_type: str
    solution_type_name: str
    subtype: str | None
    status: ProductStatus
    trl: int | None
    market_potential: float | None
    price_from_rub: float
    offers_count: int
    badges: list[Badge]
    completeness: float
    image_url: str | None
    object_types: list[str]
    processes: list[str]
    short_description: str | None
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ProductDetail:
    summary: ProductSummary
    description: str | None
    offers: list[ProductOffer]
    specs: list[SpecValue]
    cases: list[ProductCase]
    sources: list[SourceInfo]
    integration_notes: str | None
    missing_key_specs: list[str]
    similar_products: list[ProductSummary]


@dataclass(frozen=True, slots=True)
class CompareRow:
    spec_key: str
    name: str
    group: SpecGroup
    unit: str | None
    better: str
    values: dict[UUID, SpecValue]
    best_product_id: UUID | None


@dataclass(frozen=True, slots=True)
class Facet:
    key: str
    name: str
    count: int


class ProductSort(StrEnum):
    RELEVANCE = "relevance"
    NAME = "name"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    COMPLETENESS = "completeness"
    TRL = "trl"
    UPDATED = "updated"


@dataclass(frozen=True, slots=True)
class ProductQuery:
    page: int = 1
    page_size: int = 20
    q: str | None = None
    object_type: str | None = None
    process_key: str | None = None
    solution_types: tuple[str, ...] = ()
    industry: str | None = None
    manufacturer_id: UUID | None = None
    statuses: tuple[ProductStatus, ...] = ()
    badges: tuple[Badge, ...] = ()
    price_min_rub: float | None = None
    price_max_rub: float | None = None
    payload_min_kg: float | None = None
    min_completeness: float | None = None
    sort: ProductSort = ProductSort.RELEVANCE
