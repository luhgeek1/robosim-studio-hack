from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.scenario.models import (
    CountMode,
    CountSource,
    Financing as FinancingData,
    FinancingKind,
    NormOverride as NormOverrideData,
    PaymentSchedule,
    RaasTerms as RaasTermsData,
    ScenarioItemSpec,
    ScenarioKind,
)
from app.engine.matching import CandidateStatus
from app.service.scenarios.views import CalculationSummary as SummaryView, ScenarioItemView, ScenarioView


class RaasTerms(ApiModel):
    monthly_fee_rub_per_robot: float | None = Field(default=None, gt=0, examples=[100000])
    setup_fee_rub: float | None = Field(default=None, ge=0)
    per_operation_fee_rub: float | None = Field(
        default=None, gt=0, description="Альтернатива фиксированной плате"
    )
    contract_years: float | None = Field(default=None, gt=0, le=15)
    buyout_pct: float | None = Field(default=None, ge=0, le=100)
    includes_service: bool = True
    includes_software: bool = True


class Financing(ApiModel):
    kind: FinancingKind = FinancingKind.OWN_FUNDS
    rate_pct: float | None = Field(default=None, ge=0, le=100, examples=[16])
    term_years: float | None = Field(default=None, gt=0, le=30)
    down_payment_pct: float | None = Field(default=None, ge=0, le=100)
    payment_schedule: PaymentSchedule = PaymentSchedule.MONTHLY
    raas: RaasTerms = Field(default_factory=RaasTerms)
    support_measures: list[str] = Field(default_factory=list)

    def to_domain(self) -> FinancingData:
        return FinancingData(
            kind=self.kind,
            rate_pct=self.rate_pct,
            term_years=self.term_years,
            down_payment_pct=self.down_payment_pct,
            payment_schedule=self.payment_schedule,
            raas=RaasTermsData(**self.raas.model_dump()),
            support_measures=self.support_measures,
        )

    @classmethod
    def from_domain(cls, item: FinancingData) -> "Financing":
        return cls(
            kind=item.kind,
            rate_pct=item.rate_pct,
            term_years=item.term_years,
            down_payment_pct=item.down_payment_pct,
            payment_schedule=item.payment_schedule,
            raas=RaasTerms.model_validate(item.raas),
            support_measures=item.support_measures,
        )


class NormOverride(ApiModel):
    norm_key: str = Field(examples=["salary_indexation_pct"])
    value: float
    unit: str | None = None
    reason: str = Field(min_length=1, examples=["Прогноз HR-службы на 2027 год"])
    changed_by: str | None = None
    changed_at: datetime | None = None
    default_value: float | None = None

    def to_domain(self) -> NormOverrideData:
        return NormOverrideData(norm_key=self.norm_key, value=self.value, reason=self.reason, unit=self.unit)


class CountResult(ApiModel):
    analytic: int
    simulated: int | None = None
    reserve: int = 0
    final: int
    source: CountSource
    simulation_id: UUID | None = None
    explanation: str | None = None


class StationsSetting(ApiModel):
    count_mode: CountMode = CountMode.AUTO
    count: int | None = Field(default=None, ge=0)


class ScenarioItem(ApiModel):
    id: UUID
    process_key: str
    product_id: UUID
    product_name: str
    offer_id: UUID | None
    count_mode: CountMode
    count_manual: int | None = None
    count_result: CountResult | None = None
    stations: StationsSetting
    candidate_status: CandidateStatus | None = None
    notes: str | None = None
    price_rub: float = Field(description="Цена за единицу, по которой считается сценарий (с НДС)")
    price_source: Literal["catalog", "override"]
    price_override_rub: float | None = None
    throughput_override_per_hour: float | None = None
    override_reason: str | None = None

    @classmethod
    def from_domain(cls, item: ScenarioItemView) -> "ScenarioItem":
        return cls(
            id=item.id,
            process_key=item.process_key,
            product_id=item.product_id,
            product_name=item.product_name,
            offer_id=item.offer_id,
            count_mode=item.count_mode,
            count_manual=item.count_manual,
            count_result=CountResult.model_validate(item.count_result) if item.count_result else None,
            stations=StationsSetting(count_mode=item.stations_mode, count=item.stations_count),
            candidate_status=CandidateStatus(item.candidate_status) if item.candidate_status else None,
            notes=item.notes,
            price_rub=item.price_rub,
            price_source="override" if item.price_source == "override" else "catalog",
            price_override_rub=item.price_override_rub,
            throughput_override_per_hour=item.throughput_override_per_hour,
            override_reason=item.override_reason,
        )


class ScenarioItemWrite(ApiModel):
    process_key: str
    product_id: UUID
    offer_id: UUID | None = None
    count_mode: CountMode = CountMode.AUTO
    count_manual: int | None = Field(default=None, ge=1)
    stations: StationsSetting | None = None
    notes: str | None = None
    price_override_rub: float | None = Field(default=None, gt=0, description="Своя цена за единицу с НДС")
    throughput_override_per_hour: float | None = Field(
        default=None, gt=0, description="Своя производительность робота, ед/ч (ТЗ 3.5.3)"
    )
    override_reason: str | None = Field(
        default=None, description="Обязательна при своей цене или производительности"
    )

    def to_domain(self) -> ScenarioItemSpec:
        stations = self.stations or StationsSetting()
        return ScenarioItemSpec(
            process_key=self.process_key,
            product_id=self.product_id,
            offer_id=self.offer_id,
            count_mode=self.count_mode,
            count_manual=self.count_manual,
            stations_mode=stations.count_mode,
            stations_count=stations.count,
            price_override_rub=self.price_override_rub,
            throughput_override_per_hour=self.throughput_override_per_hour,
            override_reason=self.override_reason,
            notes=self.notes,
        )


class CalculationSummary(ApiModel):
    calculation_id: UUID
    computed_at: datetime
    status: Literal["fresh", "stale"]
    payback_years: float | None = None
    capex_rub: float | None = None
    effect_rub_year: float | None = None
    npv_rub: float | None = None
    verdict: str | None = None

    @classmethod
    def from_domain(cls, item: SummaryView) -> "CalculationSummary":
        return cls.model_validate(item)


class Scenario(ApiModel):
    id: UUID
    project_id: UUID
    name: str
    kind: ScenarioKind
    is_baseline: bool
    items: list[ScenarioItem]
    financing: Financing
    horizon_years: int
    discount_rate_pct: float | None = None
    overrides: list[NormOverride]
    last_calculation: CalculationSummary | None = None
    is_recommended: bool = False
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, view: ScenarioView) -> "Scenario":
        return cls(
            id=view.id,
            project_id=view.project_id,
            name=view.name,
            kind=view.kind,
            is_baseline=view.is_baseline,
            items=[ScenarioItem.from_domain(item) for item in view.items],
            financing=Financing.from_domain(view.financing),
            horizon_years=view.horizon_years,
            discount_rate_pct=view.discount_rate_pct,
            overrides=[NormOverride.model_validate(o) for o in view.overrides],
            last_calculation=CalculationSummary.from_domain(view.last_calculation)
            if view.last_calculation
            else None,
            is_recommended=view.is_recommended,
            created_at=view.created_at,
            updated_at=view.updated_at,
        )


class ScenarioList(ApiModel):
    items: list[Scenario]


class ScenarioCreate(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    kind: ScenarioKind
    items: list[ScenarioItemWrite] = Field(default_factory=list)
    financing: Financing | None = None
    horizon_years: int | None = Field(default=None, ge=1, le=30)
    discount_rate_pct: float | None = Field(default=None, ge=0, le=100)
    overrides: list[NormOverride] = Field(default_factory=list)
    from_recommendation: bool = Field(
        default=False, description="Заполнить items лучшими fit-кандидатами по каждому процессу"
    )


class ScenarioUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    items: list[ScenarioItemWrite] | None = None
    financing: Financing | None = None
    horizon_years: int | None = Field(default=None, ge=1, le=30)
    discount_rate_pct: float | None = Field(default=None, ge=0, le=100)
    overrides: list[NormOverride] | None = None


class ScenarioCopy(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    kind: ScenarioKind | None = None


class CalculateRequest(ApiModel):
    use_simulation: bool = Field(default=True, description="Брать N из последней успешной симуляции")
