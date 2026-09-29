from dataclasses import asdict, dataclass, field
from typing import Any

from app.domain.reference import ProcessDef, SizingModel
from app.domain.scenario.models import CountSource
from app.engine.calculation import CalculationResult, ItemSizing
from app.engine.calculation.context import Books
from app.engine.expressions import ExpressionError, MissingValueError
from app.engine.layout import Plan
from app.engine.simulation import (
    Dispatch,
    Failure,
    ProcessModel,
    RobotSpec,
    SimConfig,
    SimInput,
    SimMode,
    SimProcess,
    SimSettings,
    settings_from,
)
from app.engine.trace import Book
from app.service.layouts.mapping import edge_from, node_from, rack_from, zone_from
from app.service.scenarios.snapshot import Snapshot

SECONDS_PER_MINUTE = 60.0
MINUTES_PER_HOUR = 60.0
SECONDS_PER_HOUR = 3600.0
MM_PER_M = 1000.0
FMR_SOLUTION_TYPE = "fmr_forklift"
DEFAULT_SEED = 1
_MODELS = {
    SizingModel.TRANSPORT_CYCLE: ProcessModel.TRANSPORT,
    SizingModel.GOODS_TO_PERSON: ProcessModel.GOODS_TO_PERSON,
    SizingModel.TOW_TRAIN: ProcessModel.TOW_TRAIN,
}
# The reference data describes the flows of a process once; a tow train moves the same pallets as an AMR.
_FLOWS = {ProcessModel.TOW_TRAIN: ProcessModel.TRANSPORT}


@dataclass(frozen=True, slots=True)
class RunRequest:
    mode: SimMode = SimMode.NORMAL
    duration_hours: float | None = None
    seed: int | None = None
    volume_multiplier: float = 1.0
    fleet_override: dict[str, int] = field(default_factory=dict)
    stations_override: dict[str, int] = field(default_factory=dict)
    failures: list[tuple[int | None, float, float]] = field(default_factory=list)
    dispatch: Dispatch = Dispatch.NEAREST_IDLE
    record_events: bool = True


@dataclass(frozen=True, slots=True)
class Prepared:
    processes: list[SimProcess]
    skipped: dict[str, str]
    chargers: int
    settings: SimSettings


def _count(sizing: ItemSizing) -> int:
    """The working fleet: manual or simulated N as set, otherwise the analytic N without the reserve."""
    count = sizing.count
    if count.source == CountSource.MANUAL:
        return count.final
    if count.source == CountSource.SIMULATED and count.simulated:
        return count.simulated
    return count.analytic


def _step(result: CalculationResult, key: str) -> float | None:
    return next((s.value for s in result.trace if s.key == key), None)


class InputBuilder:
    """Turns a calculated scenario into the DES input: fleets, flows and targets read through the process's
    `simulation` block in the reference data, robot data from the catalog, settings from the norms."""

    def __init__(self, snapshot: Snapshot, result: CalculationResult) -> None:
        self.snapshot = snapshot
        self.result = result
        self.books = Books(snapshot.input)
        self.processes = {p.key: p for p in snapshot.input.processes}

    def _value(self, source: str | None) -> float:
        if not source:
            return 0.0
        try:
            return self.books.expression(source)[0]
        except (MissingValueError, ExpressionError):
            return 0.0

    @staticmethod
    def _charge_min(specs: Book, norms: Book) -> float | None:
        """The vendor's charging time; without it the cycle model's assumption — availability
        `analytic_availability_default` = runtime / (runtime + charge) — not a robot that never charges."""
        charge = specs.optional("charging_time_min")
        if charge is not None:
            return charge.value
        runtime = specs.optional("runtime_h")
        if runtime is None:
            return None
        availability = norms.value("analytic_availability_default")
        return runtime.value * MINUTES_PER_HOUR * (1 - availability) / availability

    def _robot(self, sizing: ItemSizing) -> RobotSpec:
        specs, norms = sizing.item.specs, self.snapshot.input.norms
        length, width = specs.optional("length_mm"), specs.optional("width_mm")
        return RobotSpec(
            speed_mps=specs.value("max_speed_mps") * norms.value("effective_speed_factor"),
            load_s=norms.value("load_handling_time_s"),
            unload_s=norms.value("unload_handling_time_s"),
            storage_extra_s=norms.value("fork_lift_cycle_extra_s")
            if sizing.item.solution_type == FMR_SOLUTION_TYPE
            else 0.0,
            runtime_h=runtime.value if (runtime := specs.optional("runtime_h")) else None,
            charge_min=self._charge_min(specs, norms),
            footprint_m=(length.value / MM_PER_M, width.value / MM_PER_M) if length and width else None,
        )

    def _station_rate(self, sizing: ItemSizing, spec: dict[str, Any]) -> float:
        """The product's own station rate when the vendor gives one — the same choice the cycle model made."""
        own = sizing.item.specs.optional("station_throughput_lines_h")
        return own.value if own is not None else self._value(spec.get("station_lines_per_hour"))

    def _process(self, sizing: ItemSizing, definition: ProcessDef, model: ProcessModel) -> SimProcess:
        spec = definition.simulation or {}
        key = definition.key
        outcome = sizing.outcome
        return SimProcess(
            key=key,
            name=definition.name,
            model=model,
            product_name=sizing.item.product_name,
            robots=_count(sizing),
            robot=self._robot(sizing),
            hours_per_day=_step(self.result, f"{key}.hours_per_day") or 0.0,
            peak_factor=_step(self.result, f"{key}.peak_factor") or 1.0,
            lead_time_s=self._value(spec.get("lead_time_min")) * SECONDS_PER_MINUTE,
            target_share=self._value(spec.get("target_share")),
            inbound_per_day=self._value(spec.get("inbound")),
            outbound_per_day=self._value(spec.get("outbound")),
            internal_per_day=self._value(spec.get("internal")),
            lines_per_day=self._value(spec.get("lines")),
            lines_per_trip=self._value(spec.get("lines_per_trip")) or 1.0,
            station_lines_per_hour=self._station_rate(sizing, spec),
            stations=sizing.stations or 0,
            analytic_robots=sizing.count.analytic,
            analytic_per_robot_h=outcome.effective_per_hour if outcome else None,
            units_per_trip=_step(self.result, f"{key}.units_per_trip") or 1.0,
        )

    def build(self) -> Prepared:
        processes: list[SimProcess] = []
        skipped: dict[str, str] = {}
        chargers = 0
        for sizing in self.result.sizing:
            definition = self.processes[sizing.item.process_key]
            model = _MODELS.get(sizing.item.sizing_model) if sizing.item.sizing_model else None
            spec_model = (definition.simulation or {}).get("model")
            if (
                model is None
                or spec_model != _FLOWS.get(model, model).value
                or sizing.item.specs.optional("max_speed_mps") is None
            ):
                skipped[definition.key] = (
                    f"«{definition.name}» ({sizing.item.product_name}) пока не имитируется: "
                    "количество остаётся по расчёту"
                )
                continue
            processes.append(self._process(sizing, definition, model))
            chargers += sizing.chargers
        inp = self.snapshot.input
        return Prepared(processes, skipped, chargers, settings_from(inp.norms, inp.params))


def config_from(request: RunRequest, chargers: int) -> SimConfig:
    return SimConfig(
        mode=request.mode,
        duration_h=request.duration_hours,
        seed=request.seed if request.seed is not None else DEFAULT_SEED,
        volume_multiplier=request.volume_multiplier,
        failures=tuple(
            Failure(at_s=at * SECONDS_PER_HOUR, duration_s=duration * SECONDS_PER_HOUR, robot_index=index)
            for index, at, duration in request.failures
        ),
        dispatch=request.dispatch,
        record_events=request.record_events,
        fleet=dict(request.fleet_override),
        stations=dict(request.stations_override),
        chargers=chargers or None,
    )


def dump_input(inp: SimInput, plan_json: dict[str, Any]) -> dict[str, Any]:
    return {
        "plan": plan_json,
        "processes": [asdict(p) for p in inp.processes],
        "settings": asdict(inp.settings),
        "config": asdict(inp.config),
    }


def load_input(data: dict[str, Any]) -> SimInput:
    raw = data["plan"]
    plan = Plan(
        float(raw["width_m"]),
        float(raw["height_m"]),
        tuple(zone_from(z) for z in raw["zones"]),
        tuple(rack_from(r) for r in raw["racks"]),
        tuple(node_from(n) for n in raw["nodes"]),
        tuple(edge_from(e) for e in raw["edges"]),
    )
    processes = tuple(
        SimProcess(
            **{
                **p,
                "model": ProcessModel(p["model"]),
                "robot": RobotSpec(
                    **{
                        **p["robot"],
                        "footprint_m": tuple(p["robot"]["footprint_m"])
                        if p["robot"]["footprint_m"]
                        else None,
                    }
                ),
            }
        )
        for p in data["processes"]
    )
    config = data["config"]
    return SimInput(
        plan=plan,
        processes=processes,
        settings=SimSettings(**data["settings"]),
        config=SimConfig(
            **{
                **config,
                "mode": SimMode(config["mode"]),
                "dispatch": Dispatch(config["dispatch"]),
                "failures": tuple(Failure(**f) for f in config["failures"]),
            }
        ),
    )
