from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from app.domain.auth import Role
from app.domain.catalog import Badge, ProductStatus
from app.domain.common.provenance import ProvenanceStatus, SourceKind

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
