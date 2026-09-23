from dataclasses import dataclass, field
from enum import StrEnum

from app.engine.layout import Plan


class SimMode(StrEnum):
    NORMAL = "normal"
    PEAK = "peak"
    CUSTOM = "custom"


class Dispatch(StrEnum):
    NEAREST_IDLE = "nearest_idle"
    FIFO = "fifo"
    ZONE_AFFINITY = "zone_affinity"


class ProcessModel(StrEnum):
    TRANSPORT = "transport"
    GOODS_TO_PERSON = "goods_to_person"
    TOW_TRAIN = "tow_train"


class State(StrEnum):
    MOVING = "moving"
    LOADING = "loading"
    UNLOADING = "unloading"
    CHARGING = "charging"
    WAITING = "waiting"
    IDLE = "idle"
    FAILED = "failed"


class ResourceKind(StrEnum):
    FLEET = "fleet"
    AISLE = "aisle"
    DOCK = "dock"
    PICK_STATION = "pick_station"
    CHARGER = "charger"
    ELEVATOR = "elevator"
    NONE = "none"


class SimulationError(ValueError):
    """The scenario cannot be simulated as given — the message tells the user what is missing."""


@dataclass(frozen=True, slots=True)
class RobotSpec:
    speed_mps: float
    load_s: float
    unload_s: float
    storage_extra_s: float = 0.0
    runtime_h: float | None = None
    charge_min: float | None = None
    footprint_m: tuple[float, float] | None = None


@dataclass(frozen=True, slots=True)
class SimProcess:
    """One robotised process as the simulation sees it: fleet, demand flows and the service target."""

    key: str
    name: str
    model: ProcessModel
    product_name: str
    robots: int
    robot: RobotSpec
    hours_per_day: float
    peak_factor: float
    lead_time_s: float
    target_share: float
    inbound_per_day: float = 0.0
    outbound_per_day: float = 0.0
    internal_per_day: float = 0.0
    lines_per_day: float = 0.0
    lines_per_trip: float = 1.0
    station_lines_per_hour: float = 0.0
    stations: int = 0
    analytic_robots: int = 0
    analytic_per_robot_h: float | None = None
    units_per_trip: float = 1.0


@dataclass(frozen=True, slots=True)
class SimSettings:
    """Simulation norms, resolved from the norm registry by the service (each has a source there)."""

    warmup_s: float
    takeover_wait_s: float
    charge_threshold: float
    peak_window_h: float
    peak_duration_h: float
    truck_pallets: float
    door_pallets_per_hour: float
    aisle_capacity: int
    two_way_width_m: float
    mtbf_h: float
    repair_s: float
    bottleneck_utilization: float
    utilization_target: float
    # Runs stored before tow trains have no such norm; they never simulate a tow train, so 0 is never read.
    tow_dispatch_wait_s: float = 0.0


@dataclass(frozen=True, slots=True)
class Failure:
    at_s: float
    duration_s: float
    robot_index: int | None = None


@dataclass(frozen=True, slots=True)
class SimConfig:
    mode: SimMode = SimMode.NORMAL
    duration_h: float | None = None
    seed: int = 1
    volume_multiplier: float = 1.0
    failures: tuple[Failure, ...] = ()
    dispatch: Dispatch = Dispatch.NEAREST_IDLE
    record_events: bool = True
    fleet: dict[str, int] = field(default_factory=dict)
    stations: dict[str, int] = field(default_factory=dict)
    chargers: int | None = None


@dataclass(frozen=True, slots=True)
class SimInput:
    plan: Plan
    processes: tuple[SimProcess, ...]
    settings: SimSettings
    config: SimConfig


@dataclass(frozen=True, slots=True)
class SimEvent:
    t: float
    type: str
    robot_id: str | None = None
    path: tuple[str, ...] = ()
    eta: float | None = None
    node: str | None = None
    edge: str | None = None
    task_id: str | None = None
    process_key: str | None = None
    dur: float | None = None
    reason: str | None = None
    battery_pct: float | None = None
    queue_after: int | None = None


@dataclass(frozen=True, slots=True)
class TimelinePoint:
    t_min: float
    done: int
    demand_cum: int
    queue: int
    sla_running_pct: float
    utilization: float
    charging: int
    failed: int
    late_cum: int


@dataclass(frozen=True, slots=True)
class RobotStats:
    robot_id: str
    process_key: str
    utilization: float
    tasks: int
    distance_km: float
    charges: int


@dataclass(frozen=True, slots=True)
class ResourceLoad:
    kind: ResourceKind
    resource_id: str
    name: str
    utilization: float
    wait_s: float
    queue_max: int
    uses: int


@dataclass(frozen=True, slots=True)
class ProcessOutcome:
    process_key: str
    robots: int
    demand: int
    completed: int
    by_humans: int
    on_time: int
    late: int
    lead_times_s: tuple[float, ...]
    utilization: float
    mean_cycle_s: float | None
    availability: float


@dataclass(slots=True)
class SimRecord:
    """Raw output of one run, before KPIs are derived from it."""

    duration_s: float
    processes: list[ProcessOutcome]
    robots: list[RobotStats]
    state_seconds: dict[str, float]
    resources: list[ResourceLoad]
    edge_traffic: dict[str, int]
    edge_wait_s: dict[str, float]
    node_visits: dict[str, int]
    timeline: list[TimelinePoint]
    events: list[SimEvent]
    robot_meta: list[tuple[str, str, str, float, str]]
    skipped: list[str] = field(default_factory=list)
