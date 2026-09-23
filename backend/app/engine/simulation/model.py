import math
import random
from collections import Counter, defaultdict
from collections.abc import Callable, Generator
from dataclasses import dataclass
from typing import Any

import simpy

from app.domain.layout.models import NodeKind
from app.engine.layout import Node
from app.engine.simulation.actions import SECONDS_PER_HOUR, Actions, Steps
from app.engine.simulation.agents import Robot, Task
from app.engine.simulation.arrivals import Arrivals, Picker
from app.engine.simulation.models import (
    Dispatch,
    ProcessModel,
    ResourceKind,
    SimEvent,
    SimInput,
    SimMode,
    SimProcess,
    SimulationError,
    State,
    TimelinePoint,
)
from app.engine.simulation.network import Network, Segment
from app.engine.simulation.resources import Tracked, tracked

SAMPLE_S = 60.0


@dataclass(slots=True)
class Counters:
    created: int = 0
    done: int = 0
    late: int = 0
    done_window: int = 0
    on_time_window: int = 0


SUPPORTED = frozenset({ProcessModel.TRANSPORT, ProcessModel.GOODS_TO_PERSON, ProcessModel.TOW_TRAIN})
PALLET_MODELS = frozenset({ProcessModel.TRANSPORT, ProcessModel.TOW_TRAIN})


@dataclass(slots=True)
class Train:
    """Pallets waiting for one tow train: they share the door (or the storage side) and leave together."""

    origin: str
    dest: str
    created: list[float]


class Model(Actions):
    """One simulation run: SimPy environment, resources of the layout, fleets, task sources, samplers."""

    def __init__(
        self, inp: SimInput, pallet_net: Network, full_net: Network, segments: list[Segment]
    ) -> None:
        self.inp = inp
        self.env = simpy.Environment()
        # S311: a seeded simulation stream, not security.
        self.rng = random.Random(inp.config.seed)  # noqa: S311
        settings, config = inp.settings, inp.config
        peak = config.duration_h or settings.peak_duration_h
        self.end_s = (
            settings.warmup_s + peak * SECONDS_PER_HOUR
            if config.mode == SimMode.PEAK
            else (config.duration_h or 24.0) * SECONDS_PER_HOUR
        )
        nodes = {kind: [n for n in inp.plan.nodes if n.kind == kind] for kind in NodeKind}
        self.nodes = nodes
        self.faces = frozenset(n.id for n in nodes[NodeKind.RACK_FACE])
        env = self.env
        self.segments = {
            s.id: tracked(env, ResourceKind.AISLE, s.id, s.name, settings.aisle_capacity) for s in segments
        }
        self.exits = self._exits(segments)
        self.docks = self._tracked(nodes[NodeKind.DOCK_IN] + nodes[NodeKind.DOCK_OUT], ResourceKind.DOCK)
        self.station_pool = self._tracked(nodes[NodeKind.PICK_STATION], ResourceKind.PICK_STATION)
        self.chargers = self._chargers(nodes[NodeKind.CHARGER])
        self.stations: dict[str, Tracked] = {}
        self.berths = {n.id: simpy.Resource(env, capacity=1) for n in nodes[NodeKind.DOCK_IN]}
        self.out_berths = {n.id: simpy.Resource(env, capacity=1) for n in nodes[NodeKind.DOCK_OUT]}
        self.face_picker = Picker(self._stream("slots"), nodes[NodeKind.RACK_FACE])
        self.pod_picker = Picker(self._stream("pods"), nodes[NodeKind.PICKUP])
        self.networks = {
            ProcessModel.TRANSPORT: pallet_net,
            ProcessModel.TOW_TRAIN: pallet_net,
            ProcessModel.GOODS_TO_PERSON: full_net,
        }
        self.events: list[SimEvent] = []
        self.edge_traffic: Counter[str] = Counter()
        self.edge_wait: defaultdict[str, float] = defaultdict(float)
        self.node_visits: Counter[str] = Counter()
        self.timeline: list[TimelinePoint] = []
        self.skipped: list[str] = []
        self.processes = self._processes()
        self.queues: dict[str, list[Task]] = {p.key: [] for p in self.processes}
        self.batches: dict[str, list[float]] = {p.key: [] for p in self.processes}
        self.trains: dict[tuple[str, str], Train] = {}
        self.tasks: list[Task] = []
        self.robots = self._robots()
        self.homes = {robot.id: robot.node for robot in self.robots}
        self.fleets = {p.key: [r for r in self.robots if r.process.key == p.key] for p in self.processes}
        self.units: dict[str, list[tuple[float, float, bool]]] = {p.key: [] for p in self.processes}
        self.lead_s = {p.key: p.lead_time_s for p in self.processes}
        self.counters = Counters()

    def _stream(self, name: str) -> random.Random:
        """Common random numbers: demand and slots do not depend on the fleet, so runs with different N
        see the same day and a fleet sweep compares fleets, not luck."""
        return random.Random(f"{self.inp.config.seed}-{name}")  # noqa: S311

    def _tracked(self, nodes: list[Node], kind: ResourceKind) -> dict[str, Tracked]:
        return {n.id: tracked(self.env, kind, n.id, n.label or n.id) for n in nodes}

    def _chargers(self, nodes: list[Node]) -> dict[str, Tracked]:
        """Charger count comes from the scenario; the layout's charging places share it evenly."""
        wanted = self.inp.config.chargers
        capacity = max(1, math.ceil(wanted / len(nodes))) if wanted and nodes else 1
        return {n.id: tracked(self.env, ResourceKind.CHARGER, n.id, n.label or n.id, capacity) for n in nodes}

    def _exits(self, segments: list[Segment]) -> dict[str, list[str]]:
        edges = {e.id: e for e in self.inp.plan.edges}
        result: dict[str, list[str]] = {}
        for segment in segments:
            ends = {n for e in segment.edges for n in (edges[e].source, edges[e].target)} - self.faces
            result[segment.id] = sorted(ends)
        return result

    def _processes(self) -> list[SimProcess]:
        result: list[SimProcess] = []
        for process in self.inp.processes:
            if process.model not in SUPPORTED:
                self.skipped.append(process.key)
                continue
            count = self.inp.config.fleet.get(process.key, process.robots)
            if process.model == ProcessModel.GOODS_TO_PERSON and not (self.pod_picker and self.station_pool):
                raise SimulationError(
                    "На планировке нет зоны «товар к человеку»: перегенерируйте её с отбором"
                )
            if process.model in PALLET_MODELS and not (self.face_picker and self.docks):
                raise SimulationError("На планировке нет ворот или мест хранения для перевозки паллет")
            result.append(process)
            if process.model == ProcessModel.GOODS_TO_PERSON:
                wanted = self.inp.config.stations.get(process.key, process.stations) or len(self.station_pool)
                for station_id in list(self.station_pool)[:wanted]:
                    self.stations[station_id] = self.station_pool[station_id]
            if count <= 0:
                self.skipped.append(process.key)
        return [p for p in result if p.key not in self.skipped]

    def _robots(self) -> list[Robot]:
        homes = [n.id for n in self.nodes[NodeKind.CHARGER]] or list(self.docks)
        robots: list[Robot] = []
        for process in self.processes:
            count = self.inp.config.fleet.get(process.key, process.robots)
            for i in range(count):
                threshold = self.inp.settings.charge_threshold
                # Batteries start evenly spread between the threshold and full, as in a fleet mid-shift.
                battery = 1 - (1 - threshold) * i / max(1, count)
                robot = Robot(
                    id=f"R{len(robots) + 1:02d}",
                    process=process,
                    network=self.networks[process.model],
                    node=homes[len(robots) % len(homes)],
                    battery=battery,
                    next_failure=self.next_failure_gap(),
                )
                robots.append(robot)
        return robots

    def process_stations(self, process_key: str) -> list[Tracked]:
        return list(self.stations.values())

    def unit_done(self, process_key: str, created: float, *, by_humans: bool) -> None:
        """One pallet or one order line finished — by a robot or handed over to people."""
        lead = self.env.now - created
        self.units[process_key].append((created, lead, by_humans))
        self.counters.done += 1
        late = by_humans or lead > self.lead_s[process_key]
        self.counters.late += late
        if created >= self.inp.settings.warmup_s:
            self.counters.done_window += 1
            self.counters.on_time_window += not late

    def add_task(
        self, process: SimProcess, origin: str, dest: str, kind: str, lines: list[float] | None = None
    ) -> None:
        task = Task(f"T{len(self.tasks) + 1}", process.key, origin, dest, self.env.now, kind, lines or [])
        self.tasks.append(task)
        if not task.lines:
            self.counters.created += 1
        idle = [r for r in self.fleets[process.key] if r.idle]
        if not idle:
            self.queues[process.key].append(task)
            return
        if self.inp.config.dispatch == Dispatch.FIFO:
            robot = min(idle, key=lambda r: r.since)
        else:
            dist = idle[0].network.tree(origin)[0]
            robot = min(idle, key=lambda r: dist.get(r.node, math.inf))
        robot.pending = task
        if robot.wake is not None:
            robot.wake.succeed()

    def _pallet(self, process: SimProcess, origin: str, dest: str, kind: str) -> None:
        """One pallet to move: its own trip for a transport robot, a place on the next tow train otherwise."""
        if process.model == ProcessModel.TRANSPORT:
            self.add_task(process, origin, dest, kind)
            return
        self.counters.created += 1
        # Inbound trains form at their door, outbound ones at the door they go to, internal ones in storage.
        side = origin if kind == "inbound" else dest if kind == "outbound" else ""
        train = self.trains.setdefault((process.key, f"{kind}:{side}"), Train(origin, dest, []))
        train.created.append(self.env.now)
        if len(train.created) >= max(1, math.floor(process.units_per_trip)):
            self._dispatch(process, (process.key, f"{kind}:{side}"), kind)

    def _dispatch(self, process: SimProcess, key: tuple[str, str], kind: str) -> None:
        train = self.trains.pop(key)
        self.add_task(process, train.origin, train.dest, kind, list(train.created))

    def _departures(self, process: SimProcess) -> Steps:
        """A slow-filling train leaves on schedule: `sim_tow_dispatch_wait_min` after its first pallet."""
        wait = self.inp.settings.tow_dispatch_wait_s
        while wait > 0:
            yield self.env.timeout(SAMPLE_S)
            for key, train in list(self.trains.items()):
                if key[0] == process.key and self.env.now - train.created[0] >= wait:
                    self._dispatch(process, key, key[1].split(":", 1)[0])

    def _sources(self, process: SimProcess) -> None:
        stream = self._stream(f"arrivals-{process.key}")
        arrivals = Arrivals(self.env, stream, process, self.inp.settings, self.inp.config, self.end_s)
        env = self.env
        if process.model in PALLET_MODELS:
            env.process(
                arrivals.trucks(
                    process.inbound_per_day,
                    self.berths,
                    lambda door: self._pallet(process, door, self.face_picker.pick(), "inbound"),
                )
            )
            env.process(
                arrivals.trucks(
                    process.outbound_per_day,
                    self.out_berths,
                    lambda door: self._pallet(process, self.face_picker.pick(), door, "outbound"),
                )
            )

            def internal() -> None:
                origin = self.face_picker.pick()
                self._pallet(process, origin, self.face_picker.pick(exclude=origin), "internal")

            env.process(arrivals.poisson(process.internal_per_day, internal))
            if process.model == ProcessModel.TOW_TRAIN:
                env.process(self._departures(process))
            return
        batch = max(1, round(process.lines_per_trip))

        def line() -> None:
            pending = self.batches[process.key]
            pending.append(self.env.now)
            self.counters.created += 1
            if len(pending) >= batch:
                pod = self.pod_picker.pick()
                self.add_task(process, pod, pod, "trip", list(pending))
                pending.clear()

        env.process(arrivals.poisson(process.lines_per_day, line))

    def _robot(self, robot: Robot) -> Steps:
        while True:
            yield from self.fail_if_due(robot)
            if self.needs_charge(robot):
                yield from self.charge(robot)
                continue
            task = robot.pending or self._take(robot)
            robot.pending = None
            if task is not None:
                yield from self.execute(robot, task)
                continue
            if robot.held is not None:
                yield from self.leave_aisle(robot)
                continue
            robot.switch(State.IDLE, self.env.now)
            robot.wake = self.env.event()
            wait = robot.next_failure - self.env.now
            if robot.forced or wait <= 0:
                robot.wake = None
                continue
            yield (robot.wake | self.env.timeout(wait)) if math.isfinite(wait) else robot.wake
            robot.wake = None

    def _take(self, robot: Robot) -> Task | None:
        queue = self.queues[robot.process.key]
        return queue.pop(0) if queue else None

    def _takeover(self) -> Steps:
        limit = self.inp.settings.takeover_wait_s
        while True:
            yield self.env.timeout(SAMPLE_S)
            for key, queue in self.queues.items():
                keep: list[Task] = []
                for task in queue:
                    if self.env.now - task.created > limit:
                        task.by_humans = True
                        task.done = self.env.now
                        for created in task.lines or [task.created]:
                            self.unit_done(key, created, by_humans=True)
                        self.emit("human_takeover", None, process_key=key, task_id=task.id, node=task.origin)
                    else:
                        keep.append(task)
                queue[:] = keep

    def _failure(self, at_s: float, duration_s: float, index: int | None) -> Steps:
        yield self.env.timeout(at_s)
        robot = self.robots[index % len(self.robots)] if index is not None else self.rng.choice(self.robots)
        robot.forced.append(duration_s)
        if robot.idle and robot.wake is not None:
            robot.wake.succeed()

    def run(self, sampler: Callable[["Model"], Generator[simpy.Event, Any]]) -> None:
        for process in self.processes:
            self._sources(process)
        for robot in self.robots:
            self.env.process(self._robot(robot))
        self.env.process(self._takeover())
        self.env.process(sampler(self))
        for failure in self.inp.config.failures:
            if self.robots and failure.at_s < self.end_s:
                self.env.process(self._failure(failure.at_s, failure.duration_s, failure.robot_index))
        self.env.run(until=self.end_s)
        for robot in self.robots:
            robot.switch(robot.state, self.end_s)
