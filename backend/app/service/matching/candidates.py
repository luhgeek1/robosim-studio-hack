from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from app.db.models import Product, ProductOffer, ProductSpec, SpecKey
from app.domain.reference import ProcessDef, SizingModel
from app.engine.demand import ProcessDemandResult
from app.engine.expressions import ExpressionError, MissingValueError, parse
from app.engine.matching import CandidateInput, SpecFact
from app.engine.sizing import DemandInput, SizingOptions, SizingOutcome, size
from app.engine.trace import Book, InputKind, Quantity

FMR_SOLUTION_TYPE = "fmr_forklift"


@dataclass(frozen=True, slots=True)
class CandidateData:
    product: Product
    offer: ProductOffer | None
    input: CandidateInput
    sizing: SizingOutcome | None


def choose_offer(offers: Sequence[ProductOffer], industry_key: str | None) -> ProductOffer | None:
    """Offer of the facility's industry (Q&A: для склада — «Торговля и услуги»), otherwise the cheapest."""
    matching = [o for o in offers if o.industry_key == industry_key]
    pool = matching or list(offers)
    return min(pool, key=lambda o: o.price_rub) if pool else None


def _expression(source: str | None, values: dict[str, float | None]) -> float | None:
    if not source:
        return None
    try:
        return parse(source).evaluate(values)
    except (MissingValueError, ExpressionError):
        return None


def demand_input(
    process: ProcessDef, result: ProcessDemandResult, values: dict[str, float | None]
) -> DemandInput | None:
    if result.peak_per_hour is None or result.avg_per_hour is None or result.demand_per_day is None:
        return None
    return DemandInput(
        process_key=process.key,
        peak_per_hour=result.peak_per_hour,
        avg_per_hour=result.avg_per_hour,
        demand_per_day=result.demand_per_day,
        hours_per_day=result.hours_per_day or 0.0,
        unit_weight_kg=_expression(process.unit_weight, values),
    )


def route_length(process: ProcessDef, values: dict[str, float | None]) -> Quantity | None:
    distance = _expression(process.route_length, values)
    if distance is None:
        return None
    return Quantity("route_length_m", "Длина маршрута в одну сторону", distance, "м", InputKind.PARAM)


def spec_book(specs: Sequence[ProductSpec], keys: dict[str, SpecKey]) -> Book:
    return Book.of(
        InputKind.SPEC,
        [
            (s.key, keys[s.key].name, s.value_num, s.unit)
            for s in specs
            if s.is_primary and s.value_num is not None
        ],
    )


@dataclass(frozen=True, slots=True)
class ProcessSizing:
    """Everything about the process that sizing a product needs; shared by all candidates of the process."""

    demand: DemandInput | None
    norms: Book
    distance: Quantity | None
    spec_keys: dict[str, SpecKey]


def build_candidate(
    product: Product,
    offer: ProductOffer | None,
    specs: Sequence[ProductSpec],
    cases: int,
    sizing_model: SizingModel | None,
    process: ProcessSizing,
) -> CandidateData:
    keys = process.spec_keys
    book = spec_book(specs, keys)
    outcome = None
    if sizing_model is not None and process.demand is not None:
        is_fmr = product.solution_type == FMR_SOLUTION_TYPE
        options = SizingOptions(distance=process.distance, is_fmr=is_fmr)
        outcome = size(sizing_model, process.demand, book, process.norms, options)
    price = offer.price_rub if offer else product.price_from_rub
    robots = outcome.total_robots if outcome else None
    candidate = CandidateInput(
        product_id=product.id,
        name=product.name,
        solution_type=product.solution_type,
        stage=product.status.value,
        trl=product.trl,
        completeness=product.completeness,
        price_rub=price,
        cases_count=cases + (1 if offer and offer.cases_text else 0),
        specs={
            s.key: SpecFact(s.value_num, s.status) for s in specs if s.is_primary and s.value_num is not None
        },
        spec_names={key: spec.name for key, spec in keys.items()},
        robots_estimate=robots,
        capex_estimate_rub=price * robots if robots and price > 0 else None,
    )
    return CandidateData(product=product, offer=offer, input=candidate, sizing=outcome)


def specs_by_product(rows: Sequence[ProductSpec]) -> dict[UUID, list[ProductSpec]]:
    grouped: dict[UUID, list[ProductSpec]] = {}
    for row in rows:
        grouped.setdefault(row.product_id, []).append(row)
    return grouped
