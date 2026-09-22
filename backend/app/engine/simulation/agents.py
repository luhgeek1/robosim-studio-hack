import math
from dataclasses import dataclass, field

import simpy
from simpy.resources.resource import Request

from app.engine.simulation.models import SimProcess, State
from app.engine.simulation.network import Network

SECONDS_PER_HOUR = 3600.0


@dataclass(slots=True, eq=False)
class Task:
    id: str
    process: str
    origin: str
    dest: str
    created: float
    kind: str
    lines: list[float] = field(default_factory=list)
    assigned: float | None = None
    done: float | None = None
    by_humans: bool = False
    lines_done: bool = False

    @property
    def units(self) -> int:
        return len(self.lines) or 1

    @property
    def open(self) -> bool:
        return self.done is None and not self.lines_done


@dataclass(slots=True, eq=False)
class Robot:
    id: str
    process: SimProcess
    network: Network
    node: str
    battery: float
    next_failure: float = math.inf
    state: State = State.IDLE
    since: float = 0.0
    seconds: dict[State, float] = field(default_factory=dict)
    held: tuple[str, Request] | None = None
    wake: simpy.Event | None = None
    pending: Task | None = None
    forced: list[float] = field(default_factory=list)
    tasks: int = 0
    distance_m: float = 0.0
    charges: int = 0
    cycles: list[float] = field(default_factory=list)

    @property
    def idle(self) -> bool:
        return self.wake is not None and not self.wake.triggered

    def switch(self, state: State, now: float) -> None:
        self.seconds[self.state] = self.seconds.get(self.state, 0.0) + now - self.since
        self.state = state
        self.since = now

    def drain(self, seconds: float) -> None:
        runtime = self.process.robot.runtime_h
        if runtime:
            self.battery = max(0.0, self.battery - seconds / (runtime * SECONDS_PER_HOUR))
