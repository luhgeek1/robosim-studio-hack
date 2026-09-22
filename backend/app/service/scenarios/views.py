from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from app.db.models import CalculationRun, Scenario, ScenarioItem
from app.domain.scenario.models import (
    CountMode,
    Financing,
    FinancingKind,
    NormOverride,
    PaymentSchedule,
    RaasTerms,
    ScenarioKind,
)


class RunStatus:
    FRESH = "fresh"
    STALE = "stale"


@dataclass(frozen=True, slots=True)
class Versions:
    project_version: int
    catalog_version: str
    norm_set_version: str
    engine_version: str

    def is_stale(self, run: CalculationRun, scenario_version: int) -> bool:
        return (
            run.project_version != self.project_version
            or run.scenario_version != scenario_version
            or run.catalog_version != self.catalog_version
            or run.norm_set_version != self.norm_set_version
            or run.engine_version != self.engine_version
        )


@dataclass(frozen=True, slots=True)
class CalculationSummary:
    calculation_id: UUID
    computed_at: datetime
    status: str
    payback_years: float | None
    capex_rub: float
    effect_rub_year: float
    npv_rub: float
    verdict: str


@dataclass(frozen=True, slots=True)
class ScenarioItemView:
    id: UUID
    process_key: str
    product_id: UUID
    product_name: str
    offer_id: UUID | None
    count_mode: CountMode
    count_manual: int | None
    stations_mode: CountMode
    stations_count: int | None
    price_rub: float
    price_source: str
    price_override_rub: float | None
    throughput_override_per_hour: float | None
    override_reason: str | None
    notes: str | None
    count_result: dict[str, Any] | None = None
    candidate_status: str | None = None


@dataclass(frozen=True, slots=True)
class ScenarioView:
    id: UUID
    project_id: UUID
    name: str
    kind: ScenarioKind
    is_baseline: bool
    items: list[ScenarioItemView]
    financing: Financing
    horizon_years: int
    discount_rate_pct: float | None
    overrides: list[NormOverride]
    is_recommended: bool
    created_at: datetime
    updated_at: datetime
    last_calculation: CalculationSummary | None = None
    warnings: list[str] = field(default_factory=list)


def financing_from_json(data: dict[str, Any] | None) -> Financing:
    data = data or {}
    raas = data.get("raas") or {}
    return Financing(
        kind=FinancingKind(data.get("kind", FinancingKind.OWN_FUNDS.value)),
        rate_pct=data.get("rate_pct"),
        term_years=data.get("term_years"),
        down_payment_pct=data.get("down_payment_pct"),
        payment_schedule=PaymentSchedule(data.get("payment_schedule", PaymentSchedule.MONTHLY.value)),
        raas=RaasTerms(**raas),
        support_measures=list(data.get("support_measures") or []),
    )


def financing_to_json(financing: Financing) -> dict[str, Any]:
    data = asdict(financing)
    data["kind"] = financing.kind.value
    data["payment_schedule"] = financing.payment_schedule.value
    return data


def overrides_from_json(rows: list[dict[str, Any]]) -> list[NormOverride]:
    return [
        NormOverride(
            norm_key=row["norm_key"],
            value=row["value"],
            reason=row["reason"],
            unit=row.get("unit"),
            changed_by=row.get("changed_by"),
            changed_at=datetime.fromisoformat(row["changed_at"]) if row.get("changed_at") else None,
            default_value=row.get("default_value"),
        )
        for row in rows
    ]


def overrides_to_json(overrides: list[NormOverride]) -> list[dict[str, Any]]:
    return [
        {**asdict(o), "changed_at": o.changed_at.isoformat() if o.changed_at else None} for o in overrides
    ]


def summary(run: CalculationRun, stale: bool) -> CalculationSummary:
    return CalculationSummary(
        calculation_id=run.id,
        computed_at=run.computed_at,
        status=RunStatus.STALE if stale else RunStatus.FRESH,
        payback_years=run.payback_years,
        capex_rub=run.capex_rub,
        effect_rub_year=run.effect_rub_year,
        npv_rub=run.npv_rub,
        verdict=run.verdict,
    )


def _item_view(
    item: ScenarioItem, names: dict[UUID, str], prices: dict[UUID, float], run: CalculationRun | None
) -> ScenarioItemView:
    sizing = next(
        (s for s in (run.result.get("sizing", []) if run else []) if s["process_key"] == item.process_key),
        None,
    )
    statuses = run.inputs.get("candidate_status", {}) if run else {}
    return ScenarioItemView(
        id=item.id,
        process_key=item.process_key,
        product_id=item.product_id,
        product_name=names.get(item.product_id, ""),
        offer_id=item.offer_id,
        count_mode=item.count_mode,
        count_manual=item.count_manual,
        stations_mode=item.stations_mode,
        stations_count=item.stations_count,
        price_rub=item.price_override_rub or prices.get(item.product_id, 0.0),
        price_source="override" if item.price_override_rub else "catalog",
        price_override_rub=item.price_override_rub,
        throughput_override_per_hour=item.throughput_override_per_hour,
        override_reason=item.override_reason,
        notes=item.notes,
        count_result=sizing["count"] if sizing else None,
        candidate_status=statuses.get(item.process_key),
    )


def scenario_view(
    scenario: Scenario,
    *,
    horizon_years: int,
    names: dict[UUID, str],
    prices: dict[UUID, float],
    run: CalculationRun | None,
    stale: bool,
) -> ScenarioView:
    return ScenarioView(
        id=scenario.id,
        project_id=scenario.project_id,
        name=scenario.name,
        kind=scenario.kind,
        is_baseline=scenario.is_baseline,
        items=[_item_view(item, names, prices, run) for item in scenario.items],
        financing=financing_from_json(scenario.financing),
        horizon_years=scenario.horizon_years or horizon_years,
        discount_rate_pct=scenario.discount_rate_pct,
        overrides=overrides_from_json(scenario.overrides),
        is_recommended=scenario.is_recommended,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        last_calculation=summary(run, stale) if run else None,
    )
