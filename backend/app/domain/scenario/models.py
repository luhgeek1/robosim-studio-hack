from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class ScenarioKind(StrEnum):
    BASELINE = "baseline"
    PURCHASE = "purchase"
    RAAS = "raas"
    LEASE = "lease"


class CountMode(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"


class CountSource(StrEnum):
    ANALYTIC = "analytic"
    SIMULATED = "simulated"
    MANUAL = "manual"


class PaymentSchedule(StrEnum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"

    @property
    def months(self) -> int:
        return {"monthly": 1, "quarterly": 3, "annual": 12}[self.value]


class FinancingKind(StrEnum):
    OWN_FUNDS = "own_funds"
    LOAN = "loan"
    LEASE = "lease"


@dataclass(frozen=True, slots=True)
class RaasTerms:
    monthly_fee_rub_per_robot: float | None = None
    setup_fee_rub: float | None = None
    per_operation_fee_rub: float | None = None
    contract_years: float | None = None
    buyout_pct: float | None = None
    includes_service: bool = True
    includes_software: bool = True


@dataclass(frozen=True, slots=True)
class Financing:
    """Доп. 2.1, 2.4: own funds by default; loan and lease take rates from norms unless given here."""

    kind: FinancingKind = FinancingKind.OWN_FUNDS
    rate_pct: float | None = None
    term_years: float | None = None
    down_payment_pct: float | None = None
    payment_schedule: PaymentSchedule = PaymentSchedule.MONTHLY
    raas: RaasTerms = field(default_factory=RaasTerms)
    support_measures: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class NormOverride:
    norm_key: str
    value: float
    reason: str
    unit: str | None = None
    changed_by: str | None = None
    changed_at: datetime | None = None
    default_value: float | None = None


@dataclass(frozen=True, slots=True)
class ScenarioItemSpec:
    process_key: str
    product_id: UUID
    offer_id: UUID | None = None
    count_mode: CountMode = CountMode.AUTO
    count_manual: int | None = None
    stations_mode: CountMode = CountMode.AUTO
    stations_count: int | None = None
    price_override_rub: float | None = None
    throughput_override_per_hour: float | None = None
    override_reason: str | None = None
    notes: str | None = None
