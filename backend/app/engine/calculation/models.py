from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from uuid import UUID

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import LaborGroupDef, ProcessDef, SiteCostDef, SizingModel
from app.domain.scenario.models import CountMode, CountSource, Financing, ScenarioKind
from app.engine.economics import EconomicsResult
from app.engine.sizing import SizingOutcome
from app.engine.trace import Book, InputKind, Quantity, TraceStep


class CalculationError(ValueError):
    """The scenario cannot be calculated as entered — the message tells the user what to fix."""


@dataclass(frozen=True, slots=True)
class ParamMeta:
    name: str
    unit: str | None
    status: ProvenanceStatus


@dataclass(frozen=True, slots=True)
class ItemInput:
    process_key: str
    product_id: UUID
    product_name: str
    solution_type: str
    sizing_model: SizingModel | None
    price: float
    specs: Book
    price_overridden: bool = False
    count_mode: CountMode = CountMode.AUTO
    count_manual: int | None = None
    stations_manual: int | None = None
    throughput_override: float | None = None
    candidate_status: str | None = None
    simulated_robots: int | None = None
    simulation_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class CalculationInput:
    object_type: str
    kind: ScenarioKind
    horizon_years: int
    discount_rate: Quantity
    financing: Financing
    params: Mapping[str, float | None]
    param_meta: Mapping[str, ParamMeta]
    norms: Book
    processes: Sequence[ProcessDef]
    labor_groups: Sequence[LaborGroupDef]
    site_costs: Sequence[SiteCostDef]
    items: Sequence[ItemInput]
    layout: Book = field(default_factory=lambda: Book(InputKind.LAYOUT, {}))


@dataclass(frozen=True, slots=True)
class CountResult:
    analytic: int
    reserve: int
    final: int
    source: CountSource
    explanation: str
    simulated: int | None = None
    simulation_id: UUID | None = None


@dataclass(slots=True)
class ItemSizing:
    item: ItemInput
    process_name: str
    demand_peak_per_hour: float
    demand_avg_per_hour: float
    outcome: SizingOutcome | None
    count: CountResult
    stations: int | None
    chargers: int
    fleet_per_hour: float | None
    coverage: float
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CalculationResult:
    kind: ScenarioKind
    sizing: list[ItemSizing]
    economics: EconomicsResult
    trace: list[TraceStep]
    warnings: list[str]
