from collections.abc import Generator
from dataclasses import dataclass, field
from typing import Any

import simpy
from simpy.resources.resource import Request

from app.engine.simulation.models import ResourceKind, ResourceLoad


@dataclass(slots=True)
class Tracked:
    """A SimPy resource that remembers how long it was held and how long robots waited for it."""

    kind: ResourceKind
    id: str
    name: str
    resource: simpy.Resource
    busy_s: float = 0.0
    wait_s: float = 0.0
    queue_max: int = 0
    uses: int = 0
    held_since: dict[int, float] = field(default_factory=dict)

    def acquire(self, env: simpy.Environment) -> Generator[simpy.Event, Any, tuple[Request, float]]:
        started = env.now
        request = self.resource.request()
        self.queue_max = max(self.queue_max, len(self.resource.queue))
        yield request
        waited = env.now - started
        self.wait_s += waited
        self.uses += 1
        self.held_since[id(request)] = env.now
        return request, waited

    def release(self, env: simpy.Environment, request: Request) -> None:
        since = self.held_since.pop(id(request), env.now)
        self.busy_s += env.now - since
        self.resource.release(request)

    def load(self, duration_s: float, end_s: float) -> ResourceLoad:
        busy = self.busy_s + sum(end_s - since for since in self.held_since.values())
        capacity = self.resource.capacity * duration_s
        return ResourceLoad(
            kind=self.kind,
            resource_id=self.id,
            name=self.name,
            utilization=min(1.0, busy / capacity) if capacity else 0.0,
            wait_s=self.wait_s,
            queue_max=self.queue_max,
            uses=self.uses,
        )


def tracked(
    env: simpy.Environment, kind: ResourceKind, resource_id: str, name: str, capacity: int = 1
) -> Tracked:
    return Tracked(kind, resource_id, name, simpy.Resource(env, capacity=capacity))
