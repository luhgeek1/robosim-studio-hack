from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.common import Money, Provenance, Scalar, Source
from app.domain.catalog import (
    Badge,
    CompareRow as CompareRowInfo,
    ProductDetail as ProductDetailInfo,
    ProductStatus,
    ProductSummary,
    SpecValue,
)
from app.domain.reference import ObjectTypeKey, SpecGroup
from app.service.catalog import CatalogFacets as CatalogFacetsInfo


class Manufacturer(ApiModel):
    id: UUID
    name: str
    country: str = "RU"
    region: str | None = None
    website: str | None = None


class Product(ApiModel):
    id: UUID
    name: str
    manufacturer: Manufacturer
    solution_type: str
    solution_type_name: str
    subtype: str | None = None
    status: ProductStatus
    trl: int | None = Field(default=None, ge=1, le=9, description="УГТ")
    market_potential: float | None = None
    price_from: Money
    offers_count: int
    badges: list[Badge]
    completeness: float = Field(ge=0, le=1, description="Доля заполненных обязательных ТТХ")
    image_url: str | None = None
    object_types: list[ObjectTypeKey] = Field(default_factory=list)
    processes: list[str] = Field(default_factory=list)
    short_description: str | None = None
    updated_at: datetime

    @classmethod
    def from_domain(cls, item: ProductSummary) -> "Product":
        return cls(
            id=item.id,
            name=item.name,
            manufacturer=Manufacturer.model_validate(item.manufacturer),
            solution_type=item.solution_type,
            solution_type_name=item.solution_type_name,
            subtype=item.subtype,
            status=item.status,
            trl=item.trl,
            market_potential=item.market_potential,
            price_from=Money(amount_rub=item.price_from_rub),
            offers_count=item.offers_count,
            badges=item.badges,
            completeness=item.completeness,
            image_url=item.image_url,
            object_types=[ObjectTypeKey(t) for t in item.object_types],
            processes=item.processes,
            short_description=item.short_description,
            updated_at=item.updated_at,
        )


class ProductList(ApiModel):
    items: list[Product]
    page: int
    page_size: int
    total: int


class Spec(ApiModel):
    key: str
    name: str
    group: SpecGroup
    value: Scalar
    unit: str | None = None
    provenance: Provenance
    is_key_constraint: bool = False

    @classmethod
    def from_domain(cls, item: SpecValue) -> "Spec":
        return cls(
            key=item.key,
            name=item.name,
            group=item.group,
            value=item.value,
            unit=item.unit,
            provenance=Provenance.from_domain(item.provenance),
            is_key_constraint=item.is_key_constraint,
        )


class ProductOffer(ApiModel):
    id: UUID
    industry: str
    scenario: str
    price: Money
    price_note: str | None = None
    cases_text: str | None = None
    source: Source


class ProductCase(ApiModel):
    customer: str
    count: int | None = None
    description: str | None = None
    year: int | None = None
    source: Source | None = None


class ProductDetail(Product):
    description: str | None = None
    offers: list[ProductOffer]
    specs: list[Spec]
    cases: list[ProductCase]
    sources: list[Source]
    integration_notes: str | None = None
    missing_key_specs: list[str] = Field(default_factory=list)
    similar_products: list[Product] = Field(default_factory=list)

    @classmethod
    def from_detail(cls, item: ProductDetailInfo) -> "ProductDetail":
        return cls(
            **Product.from_domain(item.summary).model_dump(),
            description=item.description,
            offers=[
                ProductOffer(
                    id=o.id,
                    industry=o.industry,
                    scenario=o.scenario,
                    price=Money(amount_rub=o.price_rub, vat_included=o.vat_included),
                    price_note=o.price_note,
                    cases_text=o.cases_text,
                    source=Source.from_domain(o.source),
                )
                for o in item.offers
            ],
            specs=[Spec.from_domain(s) for s in item.specs],
            cases=[
                ProductCase(
                    customer=c.customer,
                    count=c.count,
                    description=c.description,
                    year=c.year,
                    source=Source.from_domain(c.source) if c.source else None,
                )
                for c in item.cases
            ],
            sources=[Source.from_domain(s) for s in item.sources],
            integration_notes=item.integration_notes,
            missing_key_specs=item.missing_key_specs,
            similar_products=[Product.from_domain(p) for p in item.similar_products],
        )


class Facet(ApiModel):
    key: str
    name: str
    count: int


class PriceRange(ApiModel):
    min_rub: float | None = None
    max_rub: float | None = None


class CatalogFacets(ApiModel):
    solution_types: list[Facet]
    manufacturers: list[Facet]
    statuses: list[Facet]
    industries: list[Facet]
    badges: list[Facet]
    object_types: list[Facet]
    price_range: PriceRange

    @classmethod
    def from_domain(cls, item: CatalogFacetsInfo) -> "CatalogFacets":
        def facets(values: list[object]) -> list[Facet]:
            return [Facet.model_validate(value) for value in values]

        return cls(
            solution_types=facets(list(item.solution_types)),
            manufacturers=facets(list(item.manufacturers)),
            statuses=facets(list(item.statuses)),
            industries=facets(list(item.industries)),
            badges=facets(list(item.badges)),
            object_types=facets(list(item.object_types)),
            price_range=PriceRange(min_rub=item.price_min_rub, max_rub=item.price_max_rub),
        )


class CompareRequest(ApiModel):
    product_ids: list[UUID] = Field(min_length=2, max_length=5)
    object_type: ObjectTypeKey | None = None
    process_key: str | None = None
    project_id: UUID | None = None


class CompareRow(ApiModel):
    spec_key: str
    name: str
    group: SpecGroup
    unit: str | None = None
    better: str = "none"
    values: dict[str, Spec]
    best_product_id: UUID | None = None

    @classmethod
    def from_domain(cls, item: CompareRowInfo) -> "CompareRow":
        return cls(
            spec_key=item.spec_key,
            name=item.name,
            group=item.group,
            unit=item.unit,
            better=item.better,
            values={str(pid): Spec.from_domain(spec) for pid, spec in item.values.items()},
            best_product_id=item.best_product_id,
        )


class CompareResult(ApiModel):
    products: list[Product]
    rows: list[CompareRow]
