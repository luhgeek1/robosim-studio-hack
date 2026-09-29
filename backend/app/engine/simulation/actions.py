import math
import random
from collections import Counter, defaultdict
from collections.abc import Generator
from typing import Any

import simpy
from simpy.resources.resource import Request

from app.engine.simulation.agents import Robot, Task
from app.engine.simulation.models import ProcessModel, SimEvent, SimInput, State
from app.engine.simulation.network import Chunk
from app.engine.simulation.resources import Tracked

SECONDS_PER_MINUTE = 60.0
SECONDS_PER_HOUR = 3600.0
Steps = Generator[simpy.Event, Any]


class Actions:
    """What a robot does: drive holding narrow aisles, handle loads at doors, present pods, charge, fail."""

    env: simpy.Environment
    inp: SimInput
    rng: random.Random
    segments: dict[str, Tracked]
    exits: dict[str, list[str]]
    docks: dict[str, Tracked]
    stations: dict[str, Tracked]
    chargers: dict[str, Tracked]
    lifts: dict[str, Tracked]
    faces: frozenset[str]
    events: list[SimEvent]
    edge_traffic: Counter[str]
    edge_wait: defaultdict[str, float]
    node_visits: Counter[str]

    def emit(self, event_type: str, robot: Robot | None = None, **fields: Any) -> None:
        if self.inp.config.record_events:
            self.events.append(
                SimEvent(
                    t=fields.pop("t", self.env.now),
                    type=event_type,
                    robot_id=robot.id if robot else None,
                    process_key=robot.process.key if robot else fields.pop("process_key", None),
                    **fields,
                )
            )

    def _release_segment(self, robot: Robot) -> None:
        if robot.held is not None:
            segment, request = robot.held
            self.segments[segment].release(self.env, request)
            robot.held = None

    def _wait(self, robot: Robot, resource: Tracked, reason: str) -> Generator[simpy.Event, Any, Request]:
        started = self.env.now
        robot.switch(State.WAITING, started)
        request, waited = yield from resource.acquire(self.env)
        if waited > 0:
            self.emit("wait", robot, t=started, dur=waited, reason=reason, node=robot.node)
        return request

    def travel(self, robot: Robot, dest: str) -> Steps:
        if robot.node == dest:
            return
        route = robot.network.route(robot.node, dest)
        speed = robot.process.robot.speed_mps
        for chunk in route.chunks:
            if robot.held is not None and robot.held[0] != chunk.segment:
                self._release_segment(robot)
            if chunk.segment in self.lifts:
                yield from self._ride(robot, chunk)
                continue
            if chunk.segment is not None and robot.held is None:
                started = self.env.now
                robot.switch(State.WAITING, started)
                request, waited = yield from self.segments[chunk.segment].acquire(self.env)
                robot.held = (chunk.segment, request)
                if waited > 0:
                    self.edge_wait[chunk.edges[0]] += waited
                    self.emit("wait", robot, t=started, dur=waited, reason="aisle_busy", edge=chunk.edges[0])
            duration = chunk.length_m / speed
            robot.switch(State.MOVING, self.env.now)
            self.emit("move", robot, path=chunk.nodes, eta=self.env.now + duration)
            yield self.env.timeout(duration)
            robot.drain(duration)
            robot.distance_m += chunk.length_m
            self.edge_traffic.update(chunk.edges)
            robot.node = chunk.nodes[-1]
        self.node_visits[dest] += 1

    def _ride(self, robot: Robot, chunk: Chunk) -> Steps:
        """The lift ride of the cycle model (wait for the car among people, doors, floors) with the lift held:
        robots queue for the building's lifts on top of that."""
        lift = self.lifts[chunk.segment or ""]
        request = yield from self._wait(robot, lift, "elevator_busy")
        duration = robot.process.ride_s
        robot.switch(State.MOVING, self.env.now)
        self.emit("move", robot, path=chunk.nodes, eta=self.env.now + duration)
        yield self.env.timeout(duration)
        robot.drain(duration)
        lift.release(self.env, request)
        self.edge_traffic.update(chunk.edges)
        robot.node = chunk.nodes[-1]

    def handle(self, robot: Robot, node: str, seconds: float, state: State, task: Task) -> Steps:
        dock = self.docks.get(node)
        request = (yield from self._wait(robot, dock, "dock_busy")) if dock is not None else None
        robot.switch(state, self.env.now)
        self.emit(
            "load" if state == State.LOADING else "unload", robot, node=node, dur=seconds, task_id=task.id
        )
        yield self.env.timeout(seconds)
        robot.drain(seconds)
        if dock is not None and request is not None:
            dock.release(self.env, request)

    def leave_aisle(self, robot: Robot) -> Steps:
        """An idle robot must not block a one-way aisle: it drives to the nearest aisle end first."""
        if robot.held is None:
            return
        exits = self.exits[robot.held[0]]
        target = min(exits, key=lambda node: robot.network.distance(robot.node, node))
        yield from self.travel(robot, target)
        self._release_segment(robot)

    def needs_charge(self, robot: Robot) -> bool:
        spec = robot.process.robot
        return bool(spec.runtime_h and spec.charge_min) and (
            robot.charging_at_start or robot.battery <= self.inp.settings.charge_threshold
        )

    def charge(self, robot: Robot) -> Steps:
        yield from self.leave_aisle(robot)
        dist = robot.network.tree(robot.node)[0]
        charger = min(
            self.chargers.values(),
            key=lambda c: (
                (c.resource.count + len(c.resource.queue)) / c.resource.capacity,
                dist.get(c.id, math.inf),
            ),
        )
        yield from self.travel(robot, charger.id)
        request = yield from self._wait(robot, charger, "charger_busy")
        minutes = robot.process.robot.charge_min or 0.0
        duration = (1 - robot.battery) * minutes * SECONDS_PER_MINUTE
        robot.switch(State.CHARGING, self.env.now)
        self.emit("charge", robot, node=charger.id, dur=duration, battery_pct=round(robot.battery * 100, 1))
        yield self.env.timeout(duration)
        robot.battery = 1.0
        robot.charges += 1
        robot.charging_at_start = False
        charger.release(self.env, request)

    def fail_if_due(self, robot: Robot) -> Steps:
        duration: float | None = None
        if robot.forced:
            duration = robot.forced.pop(0)
        elif self.env.now >= robot.next_failure:
            duration = self.inp.settings.repair_s
            robot.next_failure = self.env.now + self.next_failure_gap()
        if duration is None:
            return
        yield from self.leave_aisle(robot)
        robot.switch(State.FAILED, self.env.now)
        self.emit("fail", robot, node=robot.node, dur=duration)
        yield self.env.timeout(duration)
        self.emit("recover", robot, node=robot.node)

    def next_failure_gap(self) -> float:
        mtbf_h = self.inp.settings.mtbf_h
        return self.rng.expovariate(1 / (mtbf_h * SECONDS_PER_HOUR)) if mtbf_h > 0 else math.inf

    def execute(self, robot: Robot, task: Task) -> Steps:
        task.assigned = self.env.now
        self.emit("task_assigned", robot, task_id=task.id, node=task.origin)
        started = self.env.now
        model = robot.process.model
        if model == ProcessModel.GOODS_TO_PERSON:
            yield from self._trip(robot, task)
        else:
            # A tow train is hitched and unhitched once per trip, as in the cycle formula of the calculation.
            yield from self._transport(robot, task)
        task.done = self.env.now
        if model == ProcessModel.TRANSPORT:
            self.unit_done(task.process, task.created, by_humans=False)
        elif model == ProcessModel.TOW_TRAIN:
            self.line_done(task)
        robot.tasks += 1
        robot.cycles.append(self.env.now - started)
        self.emit("task_done", robot, task_id=task.id, node=robot.node)

    def _transport(self, robot: Robot, task: Task) -> Steps:
        spec = robot.process.robot
        yield from self.travel(robot, task.origin)
        extra = spec.storage_extra_s if task.origin in self.faces else 0.0
        yield from self.handle(robot, task.origin, spec.load_s + extra, State.LOADING, task)
        yield from self.travel(robot, task.dest)
        extra = spec.storage_extra_s if task.dest in self.faces else 0.0
        yield from self.handle(robot, task.dest, spec.unload_s + extra, State.UNLOADING, task)

    def _trip(self, robot: Robot, task: Task) -> Steps:
        """Goods-to-person: lift a pod, queue at the least busy station, wait for picks, return the pod."""
        spec = robot.process.robot
        yield from self.travel(robot, task.origin)
        yield from self.handle(robot, task.origin, spec.load_s, State.LOADING, task)
        dist = robot.network.tree(robot.node)[0]
        station = min(
            self.process_stations(robot.process.key),
            key=lambda s: (s.resource.count + len(s.resource.queue), dist.get(s.id, math.inf)),
        )
        yield from self.travel(robot, station.id)
        request = yield from self._wait(robot, station, "station_busy")
        seconds = len(task.lines) * SECONDS_PER_HOUR / robot.process.station_lines_per_hour
        robot.switch(State.UNLOADING, self.env.now)
        self.emit("station_busy", robot, node=station.id, dur=seconds, task_id=task.id)
        yield self.env.timeout(seconds)
        task.dest = station.id
        self.line_done(task)
        station.release(self.env, request)
        yield from self.travel(robot, task.origin)
        yield from self.handle(robot, task.origin, spec.unload_s, State.UNLOADING, task)

    def process_stations(self, process_key: str) -> list[Tracked]:
        raise NotImplementedError

    def line_done(self, task: Task) -> None:
        task.lines_done = True
        for created in task.lines:
            self.unit_done(task.process, created, by_humans=False)

    def unit_done(self, process_key: str, created: float, *, by_humans: bool) -> None:
        raise NotImplementedError
