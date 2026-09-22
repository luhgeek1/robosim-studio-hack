from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.layouts import LayoutEdge, LayoutNode, Rack, Zone
from app.db.models import SimulationRun as RunRow
from app.domain.jobs import JobStatus
from app.engine.simulation import Dispatch, SimMode
from app.service.simulations.inputs import RunRequest
from app.service.simulations.service import Replay


class RobotFailure(ApiModel):
    robot_index: int | None = Field(
        default=None, ge=0, description="Какой робот флота (0..N-1); null — случайный"
    )
    at_hour: float = Field(ge=0, examples=[14])
    duration_hours: float = Field(gt=0, examples=[2])


class FleetOverride(ApiModel):
    process_key: str
    count: int = Field(ge=0)
    stations: int | None = Field(default=None, ge=0)


class SimulationRequest(ApiModel):
    mode: SimMode
    duration_hours: float = Field(default=24.0, ge=1, le=168)
    seed: int | None = None
    volume_multiplier: float = Field(default=1.0, gt=0, le=5)
    fleet_override: list[FleetOverride] = Field(default_factory=list)
    failures: list[RobotFailure] = Field(default_factory=list)
    dispatch_policy: Dispatch = Dispatch.NEAREST_IDLE
    record_events: bool = True
    compare_baseline: bool = Field(
        default=False, description="Ручной процесс тем же движком — пока не поддерживается"
    )

    def to_request(self) -> RunRequest:
        explicit = "duration_hours" in self.model_fields_set or self.mode != SimMode.PEAK
        return RunRequest(
            mode=self.mode,
            duration_hours=self.duration_hours if explicit else None,
            seed=self.seed,
            volume_multiplier=self.volume_multiplier,
            fleet_override={f.process_key: f.count for f in self.fleet_override},
            stations_override={
                f.process_key: f.stations for f in self.fleet_override if f.stations is not None
            },
            failures=[(f.robot_index, f.at_hour, f.duration_hours) for f in self.failures],
            dispatch=self.dispatch_policy,
            record_events=self.record_events,
        )


class FleetItem(ApiModel):
    process_key: str
    product_name: str
    count: int
    stations: int | None = None


class VersionStamp(ApiModel):
    project_version: int
    catalog_version: str
    norm_set_version: str
    engine_version: str
    layout_version: int | None = None
    computed_at: datetime
    inputs_hash: str | None = None


class SimulationRun(ApiModel):
    id: UUID
    scenario_id: UUID
    calculation_id: UUID | None = None
    status: JobStatus
    progress: float
    stage: str | None = None
    config: dict[str, Any]
    versions: VersionStamp
    layout_id: UUID
    layout_version: int
    seed: int
    purpose: Literal["run", "sweep"] = "run"
    job_id: UUID | None = None
    fleet: list[FleetItem]
    summary: dict[str, Any] | None = None
    duration_ms: int | None = None
    events_count: int = 0
    created_at: datetime
    finished_at: datetime | None = None
    error: dict[str, Any] | None = None

    @classmethod
    def from_row(cls, run: RunRow) -> "SimulationRun":
        return cls(
            id=run.id,
            scenario_id=run.scenario_id,
            calculation_id=run.calculation_id,
            status=run.status,
            progress=run.progress,
            stage=run.stage,
            config=run.config,
            versions=VersionStamp.model_validate(run.versions),
            layout_id=run.layout_id,
            layout_version=run.layout_version,
            seed=run.seed,
            purpose="sweep" if run.purpose == "sweep" else "run",
            job_id=run.job_id,
            fleet=[FleetItem.model_validate(f) for f in run.fleet],
            summary=run.summary,
            duration_ms=run.duration_ms,
            events_count=run.events_count,
            created_at=run.created_at,
            finished_at=run.finished_at,
            error=run.error,
        )


class SimulationList(ApiModel):
    items: list[SimulationRun]


class TimelinePoint(ApiModel):
    t_min: float
    done: int
    demand_cum: int
    queue: int
    sla_running_pct: float
    utilization: float
    charging: int = 0
    failed: int = 0
    late_cum: int = 0


class SimulationTimeline(ApiModel):
    simulation_id: UUID
    step_min: float
    points: list[TimelinePoint]


class ReplayRobot(ApiModel):
    id: str
    process_key: str
    product_name: str
    footprint_m: list[float] | None = None
    speed_mps: float | None = None
    home_node: str | None = None


class ReplayLayout(ApiModel):
    width_m: float
    height_m: float
    zones: list[Zone]
    racks: list[Rack]
    nodes: list[LayoutNode]
    edges: list[LayoutEdge]


class SimulationReplay(ApiModel):
    simulation_id: UUID
    layout: ReplayLayout
    robots: list[ReplayRobot]
    total_seconds: float
    from_s: float
    to_s: float
    next_from_s: float | None
    events: list[dict[str, Any]]
    tasks_snapshot: list[dict[str, Any]] = Field(default_factory=list)

    @classmethod
    def from_replay(cls, replay: Replay) -> "SimulationReplay":
        return cls(
            simulation_id=replay.run.id,
            layout=ReplayLayout.model_validate(replay.layout),
            robots=[ReplayRobot.model_validate(r) for r in replay.robots],
            total_seconds=replay.total_seconds,
            from_s=replay.from_s,
            to_s=replay.to_s,
            next_from_s=replay.next_from_s,
            events=replay.events,
        )


class SimulationHeatmap(ApiModel):
    simulation_id: UUID
    edges: list[dict[str, Any]]
    zones: list[dict[str, Any]]
    nodes: list[dict[str, Any]] = Field(default_factory=list)


class FleetSweepRequest(ApiModel):
    process_key: str
    from_count: int | None = Field(default=None, ge=1)
    to_count: int | None = Field(default=None, ge=1)
    mode: SimMode = SimMode.PEAK
    seed: int | None = None


class FleetSweepPoint(ApiModel):
    count: int
    sla_achieved_pct: float
    sla_min_pct: float | None = None
    utilization: float
    throughput_per_hour: float
    queue_max: int | None = None
    capex_rub: float | None = None
    payback_years: float | None = None
    simulation_id: UUID | None = None
    passed: bool | None = None
    runs: int | None = None


class FleetSweepResult(ApiModel):
    process_key: str
    points: list[FleetSweepPoint]
    recommended_count: int | None
    analytic_count: int | None = None
    target_pct: float | None = None
    explanation: str
    simulation_id: UUID | None = None
    applied: bool = False
