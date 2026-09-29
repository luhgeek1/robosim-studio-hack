from datetime import date
from typing import Any

from app.domain.admin import OfferInput, ProductInput, SourceInput, SpecInput
from app.domain.catalog import Badge, ProductStatus
from app.domain.common.provenance import ProvenanceStatus, SourceKind


def source_to_json(source: SourceInput) -> dict[str, Any]:
    return {
        "kind": source.kind.value,
        "title": source.title,
        "url": source.url,
        "retrieved_at": source.retrieved_at.isoformat() if source.retrieved_at else None,
        "note": source.note,
    }


def source_from_json(raw: dict[str, Any]) -> SourceInput:
    retrieved = raw.get("retrieved_at")
    return SourceInput(
        kind=SourceKind(raw["kind"]),
        title=raw["title"],
        url=raw.get("url"),
        retrieved_at=date.fromisoformat(retrieved) if retrieved else None,
        note=raw.get("note"),
    )


def product_to_json(product: ProductInput) -> dict[str, Any]:
    return {
        "name": product.name,
        "manufacturer_name": product.manufacturer_name,
        "manufacturer_country": product.manufacturer_country,
        "manufacturer_region": product.manufacturer_region,
        "solution_type": product.solution_type,
        "subtype": product.subtype,
        "status": product.status.value,
        "trl": product.trl,
        "market_potential": product.market_potential,
        "description": product.description,
        "image_url": product.image_url,
        "object_types": list(product.object_types),
        "processes": list(product.processes),
        "badges": [badge.value for badge in product.badges],
        "offers": [
            {
                "industry": offer.industry,
                "scenario": offer.scenario,
                "price_rub": offer.price_rub,
                "vat_included": offer.vat_included,
                "cases_text": offer.cases_text,
                "source": source_to_json(offer.source) if offer.source else None,
            }
            for offer in product.offers
        ],
    }


def product_from_json(raw: dict[str, Any]) -> ProductInput:
    return ProductInput(
        name=raw["name"],
        manufacturer_name=raw["manufacturer_name"],
        manufacturer_country=raw["manufacturer_country"],
        manufacturer_region=raw.get("manufacturer_region"),
        solution_type=raw["solution_type"],
        subtype=raw.get("subtype"),
        status=ProductStatus(raw["status"]),
        trl=raw.get("trl"),
        market_potential=raw.get("market_potential"),
        description=raw.get("description"),
        image_url=raw.get("image_url"),
        object_types=list(raw.get("object_types", [])),
        processes=list(raw.get("processes", [])),
        badges=[Badge(badge) for badge in raw.get("badges", [])],
        offers=[
            OfferInput(
                industry=offer["industry"],
                scenario=offer["scenario"],
                price_rub=offer["price_rub"],
                vat_included=offer["vat_included"],
                cases_text=offer.get("cases_text"),
                source=source_from_json(offer["source"]) if offer.get("source") else None,
            )
            for offer in raw.get("offers", [])
        ],
    )


def spec_to_json(spec: SpecInput) -> dict[str, Any]:
    return {
        "key": spec.key,
        "value": spec.value,
        "unit": spec.unit,
        "status": spec.status.value,
        "source": source_to_json(spec.source),
        "note": spec.note,
    }


def spec_from_json(raw: dict[str, Any]) -> SpecInput:
    return SpecInput(
        key=raw["key"],
        value=raw["value"],
        unit=raw.get("unit"),
        status=ProvenanceStatus(raw["status"]),
        source=source_from_json(raw["source"]),
        note=raw.get("note"),
    )
