from dataclasses import dataclass

from app.domain.scenario.models import Financing, ScenarioKind
from app.engine.calculation import CalculationError, CalculationInput, ItemInput, calculate
from app.service.matching.candidates import CandidateData
from app.service.projects.processes import ProcessAnalysis
from app.service.scenarios.snapshot import param_meta


@dataclass(frozen=True, slots=True)
class QuickEconomics:
    """Purchase of one candidate for its process, with the object's fixed costs charged to it in full."""

    payback_years: float | None
    npv_rub: float
    effect_rub_year: float


def horizon_years(analysis: ProcessAnalysis) -> int:
    horizon = analysis.values.get("horizon_years")
    object_type = analysis.context.project.object_type
    return int(horizon) if horizon else int(analysis.norms.value(f"horizon_years_{object_type}"))


def payback_limit_years(analysis: ProcessAnalysis) -> float:
    """Longest payback a recommendation tolerates: the «сомнительно» band of ТЗ 3.5.7, within the horizon."""
    return min(analysis.norms.value("verdict_payback_questionable_years"), float(horizon_years(analysis)))


def quick_economics(
    analysis: ProcessAnalysis, process_key: str, data: CandidateData
) -> QuickEconomics | None:
    context = analysis.context
    product = data.product
    item = ItemInput(
        process_key=process_key,
        product_id=product.id,
        product_name=product.name,
        solution_type=product.solution_type,
        sizing_model=data.sizing_model,
        price=data.input.price_rub,
        specs=data.specs,
    )
    engine_input = CalculationInput(
        object_type=context.project.object_type,
        kind=ScenarioKind.PURCHASE,
        horizon_years=horizon_years(analysis),
        discount_rate=analysis.norms.get("discount_rate"),
        financing=Financing(),
        params={k: v for k, v in context.numeric().items() if v is not None},
        param_meta=param_meta(context),
        norms=analysis.norms,
        processes=context.object_type.processes,
        labor_groups=context.object_type.labor_groups,
        site_costs=context.object_type.site_costs,
        items=[item],
        layout=analysis.layout,
    )
    try:
        metrics = calculate(engine_input, render=False).economics.metrics
    except CalculationError:
        return None
    return QuickEconomics(metrics.payback_years, metrics.npv_rub, metrics.effect_rub_year)
