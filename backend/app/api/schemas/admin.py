from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.auth import User
from app.api.schemas.base import ApiModel
from app.api.schemas.common import Money
from app.domain.admin import (
    AnalyticsOverview as AnalyticsOverviewInfo,
    NormChange,
    OfferInput,
    ProductInput,
    SourceInput,
    SpecInput,
    UserChange,
)
from app.domain.auth import Role
from app.domain.catalog import Badge, ProductStatus
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.domain.reference import ObjectTypeKey


class SourceWrite(ApiModel):
    kind: SourceKind
    title: str = Field(min_length=1, max_length=500)
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None

    def to_domain(self) -> SourceInput:
        return SourceInput(
            kind=self.kind, title=self.title, url=self.url, retrieved_at=self.retrieved_at, note=self.note
        )


class OfferWrite(ApiModel):
    industry: str = Field(min_length=1, examples=["Торговля и услуги"])
    scenario: str = Field(min_length=1, examples=["Внутрискладская логистика"])
    price: Money
    cases_text: str | None = None
    source: SourceWrite | None = None

    def to_domain(self) -> OfferInput:
        return OfferInput(
            industry=self.industry,
            scenario=self.scenario,
            price_rub=self.price.amount_rub,
            vat_included=self.price.vat_included,
            cases_text=self.cases_text,
            source=self.source.to_domain() if self.source else None,
        )


class ProductWrite(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    manufacturer_name: str = Field(min_length=1, max_length=255)
    manufacturer_country: str = Field(default="RU", min_length=2, max_length=2)
    manufacturer_region: str | None = Field(default=None, max_length=120)
    solution_type: str
    subtype: str | None = Field(default=None, max_length=255)
    status: ProductStatus
    trl: int | None = Field(default=None, ge=1, le=9)
    market_potential: float | None = Field(default=None, ge=1, le=5)
    description: str | None = None
    image_url: str | None = None
    object_types: list[ObjectTypeKey] = Field(default_factory=list)
    processes: list[str] = Field(default_factory=list)
    badges: list[Badge] = Field(default_factory=list)
    offers: list[OfferWrite] = Field(default_factory=list)

    def to_domain(self) -> ProductInput:
        return ProductInput(
            name=self.name,
            manufacturer_name=self.manufacturer_name,
            manufacturer_country=self.manufacturer_country.upper(),
            manufacturer_region=self.manufacturer_region,
            solution_type=self.solution_type,
            subtype=self.subtype,
            status=self.status,
            trl=self.trl,
            market_potential=self.market_potential,
            description=self.description,
            image_url=self.image_url,
            object_types=[t.value for t in self.object_types],
            processes=self.processes,
            badges=self.badges,
            offers=[offer.to_domain() for offer in self.offers],
        )


class SpecWrite(ApiModel):
    key: str
    value: bool | int | float | str
    unit: str | None = None
    status: Literal["confirmed", "vendor_claim", "assumption"] = "confirmed"
    source: SourceWrite
    note: str | None = None

    def to_domain(self) -> SpecInput:
        return SpecInput(
            key=self.key,
            value=self.value,
            unit=self.unit,
            status=ProvenanceStatus(self.status),
            source=self.source.to_domain(),
            note=self.note,
        )


class SpecsBulkWrite(ApiModel):
    specs: list[SpecWrite] = Field(min_length=1)


class NormChangeWrite(ApiModel):
    key: str
    value: float
    unit: str | None = None
    source: SourceWrite | None = None
    rationale: str | None = None

    def to_domain(self) -> NormChange:
        return NormChange(
            key=self.key,
            value=self.value,
            unit=self.unit,
            source=self.source.to_domain() if self.source else None,
            rationale=self.rationale,
        )


class NormSetCreate(ApiModel):
    notes: str = Field(min_length=1, examples=["Обновлена ставка дисконтирования по ключевой ставке ЦБ 14 %"])
    changes: list[NormChangeWrite]


class AdminUserUpdate(ApiModel):
    role: Role | None = None
    is_active: bool | None = None
    vendor_manufacturer_id: UUID | None = None

    def to_domain(self) -> UserChange:
        return UserChange(
            role=self.role,
            is_active=self.is_active,
            vendor_manufacturer_id=self.vendor_manufacturer_id,
            vendor_manufacturer_set="vendor_manufacturer_id" in self.model_fields_set,
        )


class UserList(ApiModel):
    items: list[User]
    page: int
    page_size: int
    total: int


class ProductUsage(ApiModel):
    product_id: str
    name: str
    count: int


class CatalogGap(ApiModel):
    object_type: str
    process_key: str
    no_fit_count: int


class AnalyticsOverview(ApiModel):
    period: dict[str, date] = Field(description="Границы периода (включительно), если заданы")
    projects_by_object_type: dict[str, int]
    calculations_count: int
    avg_payback_years_by_object_type: dict[str, float]
    top_products_in_scenarios: list[ProductUsage]
    demand_by_industry: dict[str, int]
    catalog_gaps: list[CatalogGap]
    rfq_count: int

    @classmethod
    def from_domain(cls, item: AnalyticsOverviewInfo) -> "AnalyticsOverview":
        bounds = {"from": item.period_from, "to": item.period_to}
        return cls(
            period={key: value for key, value in bounds.items() if value is not None},
            projects_by_object_type=item.projects_by_object_type,
            calculations_count=item.calculations_count,
            avg_payback_years_by_object_type=item.avg_payback_years_by_object_type,
            top_products_in_scenarios=[
                ProductUsage(product_id=str(p.product_id), name=p.name, count=p.count)
                for p in item.top_products_in_scenarios
            ],
            demand_by_industry=item.demand_by_industry,
            catalog_gaps=[CatalogGap.model_validate(gap) for gap in item.catalog_gaps],
            rfq_count=item.rfq_count,
        )
