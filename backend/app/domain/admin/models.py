from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from app.domain.auth import Role
from app.domain.catalog import Badge, ProductStatus
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.domain.reference import ParameterDef

SpecScalar = float | int | str | bool


@dataclass(frozen=True, slots=True)
class SourceInput:
    kind: SourceKind
    title: str
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None


@dataclass(frozen=True, slots=True)
class OfferInput:
    industry: str
    scenario: str
    price_rub: float
    vat_included: bool
    cases_text: str | None
    source: SourceInput | None


@dataclass(frozen=True, slots=True)
class ProductInput:
    name: str
    manufacturer_name: str
    manufacturer_country: str
    manufacturer_region: str | None
    solution_type: str
    subtype: str | None
    status: ProductStatus
    trl: int | None
    market_potential: float | None
    description: str | None
    image_url: str | None
    object_types: list[str] = field(default_factory=list)
    processes: list[str] = field(default_factory=list)
    badges: list[Badge] = field(default_factory=list)
    offers: list[OfferInput] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class SpecInput:
    key: str
    value: SpecScalar
    unit: str | None
    status: ProvenanceStatus
    source: SourceInput
    note: str | None


@dataclass(frozen=True, slots=True)
class NormChange:
    key: str
    value: float
    unit: str | None
    source: SourceInput | None
    rationale: str | None


@dataclass(frozen=True, slots=True)
class UserChange:
    role: Role | None = None
    is_active: bool | None = None
    vendor_manufacturer_id: UUID | None = None
    vendor_manufacturer_set: bool = False


@dataclass(frozen=True, slots=True)
class UserQuery:
    page: int = 1
    page_size: int = 20
    q: str | None = None
    role: Role | None = None


@dataclass(frozen=True, slots=True)
class ProductCount:
    product_id: UUID
    name: str
    count: int


@dataclass(frozen=True, slots=True)
class CatalogGap:
    object_type: str
    process_key: str
    no_fit_count: int


@dataclass(frozen=True, slots=True)
class AnalyticsOverview:
    period_from: date | None
    period_to: date | None
    projects_by_object_type: dict[str, int]
    calculations_count: int
    avg_payback_years_by_object_type: dict[str, float]
    top_products_in_scenarios: list[ProductCount]
    demand_by_industry: dict[str, int]
    catalog_gaps: list[CatalogGap]
    rfq_count: int


@dataclass(frozen=True, slots=True)
class DefaultChange:
    """A new reference default of one parameter: the value, where it comes from and why."""

    value: SpecScalar
    unit: str | None
    status: ProvenanceStatus | None
    source: SourceInput
    rationale: str


@dataclass(frozen=True, slots=True)
class DefaultView:
    """A parameter with its reference default and how many projects of the object type rely on it."""

    object_type: str
    group_name: str
    definition: ParameterDef
    applies_to_blank: bool
    projects_total: int
    projects_using_default: int
    changed_by: str | None = None
    changed_at: datetime | None = None


class Freshness(StrEnum):
    FRESH = "fresh"
    STALE = "stale"
    UNDATED = "undated"


@dataclass(frozen=True, slots=True)
class SourceEdit:
    """Fields of a registry source the admin changes; ``fields`` names the ones sent in the request."""

    title: str | None = None
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None
    fields: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class SourceQuery:
    page: int = 1
    page_size: int = 50
    q: str | None = None
    kind: SourceKind | None = None
    freshness: Freshness | None = None
    include_unused: bool = False


@dataclass(frozen=True, slots=True)
class SourceUsage:
    specs: int = 0
    offers: int = 0
    cases: int = 0
    norms: int = 0
    parameters: int = 0

    @property
    def total(self) -> int:
        return self.specs + self.offers + self.cases + self.norms + self.parameters


@dataclass(frozen=True, slots=True)
class SourceEntry:
    id: UUID
    kind: SourceKind
    title: str
    url: str | None
    retrieved_at: date | None
    note: str | None
    usage: SourceUsage
    freshness: Freshness
