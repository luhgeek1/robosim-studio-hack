from uuid import UUID

from app.db.models import Manufacturer, Product, ProductCase, ProductOffer, ProductSpec, Source, SpecKey
from app.db.repositories.sources import to_source
from app.domain.catalog import (
    Badge,
    Manufacturer as ManufacturerInfo,
    ProductCase as ProductCaseInfo,
    ProductOffer as ProductOfferInfo,
    ProductStatus,
    ProductSummary,
    SpecValue,
)
from app.domain.common.provenance import Provenance
from app.domain.reference import SpecGroup

PRICE_NOTE = "Цена изделия с НДС; без доставки, ПНР и интеграции (Доп. 6)"
_SHORT_DESCRIPTION_CHARS = 240


def _short(text: str | None) -> str | None:
    if not text or len(text) <= _SHORT_DESCRIPTION_CHARS:
        return text
    return text[:_SHORT_DESCRIPTION_CHARS].rsplit(" ", 1)[0] + "…"


def to_manufacturer(item: Manufacturer) -> ManufacturerInfo:
    return ManufacturerInfo(
        id=item.id, name=item.name, country=item.country, region=item.region, website=item.website
    )


def to_summary(
    product: Product, manufacturer: Manufacturer, solution_type_names: dict[str, str]
) -> ProductSummary:
    return ProductSummary(
        id=product.id,
        name=product.name,
        manufacturer=to_manufacturer(manufacturer),
        solution_type=product.solution_type,
        solution_type_name=solution_type_names.get(product.solution_type, product.solution_type),
        subtype=product.subtype,
        status=ProductStatus(product.status),
        trl=product.trl,
        market_potential=product.market_potential,
        price_from_rub=product.price_from_rub,
        offers_count=product.offers_count,
        badges=[Badge(badge) for badge in product.badges],
        completeness=product.completeness,
        image_url=product.image_url,
        object_types=product.object_types,
        processes=product.processes,
        short_description=_short(product.description),
        updated_at=product.updated_at,
    )


def to_offer(offer: ProductOffer, industry_name: str, source: Source) -> ProductOfferInfo:
    return ProductOfferInfo(
        id=offer.id,
        industry=industry_name,
        scenario=offer.scenario,
        price_rub=offer.price_rub,
        vat_included=offer.vat_included,
        price_note=PRICE_NOTE,
        cases_text=offer.cases_text,
        source=to_source(source),
    )


def to_spec(spec: ProductSpec, key: SpecKey, sources: dict[UUID, Source]) -> SpecValue:
    source = sources.get(spec.source_id) if spec.source_id else None
    return SpecValue(
        key=spec.key,
        name=key.name,
        group=SpecGroup(key.group),
        value=spec.value,
        unit=spec.unit or key.unit,
        provenance=Provenance(
            status=spec.status,
            source=to_source(source) if source else None,
            confidence=spec.confidence,
            raw_value=spec.raw_value,
            note=spec.note,
        ),
        is_key_constraint=key.is_key_constraint,
        is_primary=spec.is_primary,
    )


def to_case(case: ProductCase, sources: dict[UUID, Source]) -> ProductCaseInfo:
    source = sources.get(case.source_id) if case.source_id else None
    return ProductCaseInfo(
        customer=case.customer,
        count=case.count,
        description=case.description,
        year=case.year,
        source=to_source(source) if source else None,
    )
