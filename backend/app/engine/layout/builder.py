import itertools
import math
from typing import Any

from app.domain.layout.models import EdgeKind, NodeKind, RackOrientation, ZoneKind
from app.engine.layout.models import Edge, Node, Plan, Point, Rack, Zone

PRECISION = 2
_TWO_LANES = 2


def rect(x0: float, y0: float, x1: float, y1: float) -> tuple[Point, ...]:
    return tuple(
        (round(x, PRECISION), round(y, PRECISION)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
    )


class PlanBuilder:
    """Collects plan elements with sequential ids; edge capacity follows from width and robot headway."""

    def __init__(self, width: float, height: float, headway: float, two_way_width: float) -> None:
        self.width = width
        self.height = height
        self.headway = headway
        self.two_way_width = two_way_width
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []
        self.zones: list[Zone] = []
        self.racks: list[Rack] = []

    def node(
        self,
        x: float,
        y: float,
        kind: NodeKind,
        *,
        zone: str | None = None,
        capacity: int | None = None,
        label: str | None = None,
    ) -> str:
        node_id = f"n{len(self.nodes) + 1}"
        self.nodes[node_id] = Node(
            node_id, round(x, PRECISION), round(y, PRECISION), kind, zone, capacity, label
        )
        return node_id

    def edge(self, a: str, b: str, width: float, kind: EdgeKind) -> None:
        first, second = self.nodes[a], self.nodes[b]
        length = math.hypot(first.x - second.x, first.y - second.y)
        if length <= 0:
            return
        lanes = _TWO_LANES if width >= self.two_way_width else 1
        capacity = lanes * max(1, math.floor(length / self.headway))
        self.edges.append(
            Edge(f"e{len(self.edges) + 1}", a, b, round(length, PRECISION), width, capacity, False, kind)
        )

    def chain(self, ids: list[str], width: float, kind: EdgeKind) -> None:
        for a, b in itertools.pairwise(ids):
            self.edge(a, b, width, kind)

    def zone(
        self,
        kind: ZoneKind,
        name: str,
        box: tuple[float, float, float, float],
        capacity: int | None = None,
        **meta: Any,
    ) -> str:
        zone_id = f"z{len(self.zones) + 1}"
        self.zones.append(Zone(zone_id, kind, name, rect(*box), capacity, meta))
        return zone_id

    def rack(self, box: tuple[float, float, float, float], levels: int, slots: int) -> None:
        self.racks.append(
            Rack(f"r{len(self.racks) + 1}", rect(*box), levels, RackOrientation.VERTICAL, slots)
        )

    def plan(self) -> Plan:
        return Plan(
            round(self.width, PRECISION),
            round(self.height, PRECISION),
            tuple(self.zones),
            tuple(self.racks),
            tuple(self.nodes.values()),
            tuple(self.edges),
        )


class Aisle:
    """A straight horizontal aisle: other elements attach at x, the stops are chained when closed."""

    def __init__(self, builder: PlanBuilder, y: float, width: float, kind: EdgeKind, zone: str) -> None:
        self.builder = builder
        self.y = y
        self.width = width
        self.kind = kind
        self.zone = zone
        self.stops: dict[float, str] = {}

    def stop(self, x: float) -> str:
        key = round(x, PRECISION)
        if key not in self.stops:
            self.stops[key] = self.builder.node(key, self.y, NodeKind.WAYPOINT, zone=self.zone)
        return self.stops[key]

    def close(self) -> None:
        self.builder.chain([self.stops[x] for x in sorted(self.stops)], self.width, self.kind)
