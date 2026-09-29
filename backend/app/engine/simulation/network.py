import heapq
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass

from app.domain.layout.models import EdgeKind, NodeKind
from app.engine.layout import Edge, Node, Plan
from app.engine.simulation.models import SimulationError

Tree = tuple[dict[str, float], dict[str, tuple[str, str]]]


@dataclass(frozen=True, slots=True)
class Chunk:
    """A stretch of a route that is either inside one narrow aisle segment or on free main aisles."""

    nodes: tuple[str, ...]
    edges: tuple[str, ...]
    length_m: float
    segment: str | None


@dataclass(frozen=True, slots=True)
class Route:
    nodes: tuple[str, ...]
    length_m: float
    chunks: tuple[Chunk, ...]


@dataclass(frozen=True, slots=True)
class Segment:
    id: str
    name: str
    edges: frozenset[str]


def lift_id(edge_id: str) -> str:
    return f"lift:{edge_id}"


def narrow_segments(plan: Plan, two_way_width_m: float) -> list[Segment]:
    """Rack-aisle edges too narrow for two robots, joined through rack faces into one-robot segments.

    Junctions on main and cross aisles split segments: a robot waiting there does not block the aisle.
    """
    kinds = {node.id: node.kind for node in plan.nodes}
    narrow = [e for e in plan.edges if e.kind == EdgeKind.RACK_AISLE and e.width_m < two_way_width_m]
    parent: dict[str, str] = {e.id: e.id for e in narrow}

    def find(edge_id: str) -> str:
        while parent[edge_id] != edge_id:
            parent[edge_id] = parent[parent[edge_id]]
            edge_id = parent[edge_id]
        return edge_id

    by_face: dict[str, list[str]] = defaultdict(list)
    for edge in narrow:
        for node in (edge.source, edge.target):
            if kinds.get(node) == NodeKind.RACK_FACE:
                by_face[node].append(edge.id)
    for edges in by_face.values():
        for other in edges[1:]:
            parent[find(other)] = find(edges[0])
    groups: dict[str, set[str]] = defaultdict(set)
    for edge in narrow:
        groups[find(edge.id)].add(edge.id)
    nodes = {node.id: node for node in plan.nodes}
    by_id = {edge.id: edge for edge in narrow}

    def anchor(edge_ids: set[str]) -> tuple[float, float]:
        points = [nodes[n] for e in edge_ids for n in (by_id[e].source, by_id[e].target)]
        return min(p.x for p in points), min(p.y for p in points)

    ordered = sorted(groups.values(), key=anchor)
    columns = sorted({round(anchor(g)[0], 1) for g in ordered})
    result: list[Segment] = []
    for index, edge_ids in enumerate(ordered, 1):
        column = columns.index(round(anchor(edge_ids)[0], 1)) + 1
        result.append(Segment(f"s{index}", f"Рабочий проход {column}", frozenset(edge_ids)))
    return result


class Network:
    """Shortest routes on the layout graph, cached per source; routes are cut at narrow aisle segments."""

    def __init__(
        self, plan: Plan, segments: list[Segment], allow: Callable[[Edge], bool] | None = None
    ) -> None:
        self.nodes: dict[str, Node] = {node.id: node for node in plan.nodes}
        self.adjacency: dict[str, list[tuple[str, float, str]]] = defaultdict(list)
        for edge in plan.edges:
            if allow is not None and not allow(edge):
                continue
            self.adjacency[edge.source].append((edge.target, edge.length_m, edge.id))
            if not edge.one_way:
                self.adjacency[edge.target].append((edge.source, edge.length_m, edge.id))
        self.segment_of = {edge_id: s.id for s in segments for edge_id in s.edges}
        # A lift hop is a chunk of its own: the robot waits for the lift and rides, it does not drive.
        self.segment_of.update(
            {edge.id: lift_id(edge.id) for edge in plan.edges if edge.kind == EdgeKind.ELEVATOR_LINK}
        )
        self.lengths = {edge.id: edge.length_m for edge in plan.edges}
        self._trees: dict[str, Tree] = {}
        self._routes: dict[tuple[str, str], Route] = {}

    def tree(self, source: str) -> Tree:
        cached = self._trees.get(source)
        if cached is not None:
            return cached
        dist: dict[str, float] = {}
        pred: dict[str, tuple[str, str]] = {}
        queue: list[tuple[float, str, str, str]] = [(0.0, source, "", "")]
        while queue:
            d, node, prev, edge = heapq.heappop(queue)
            if node in dist:
                continue
            dist[node] = d
            if prev:
                pred[node] = (prev, edge)
            for target, length, edge_id in self.adjacency[node]:
                if target not in dist:
                    heapq.heappush(queue, (d + length, target, node, edge_id))
        self._trees[source] = (dist, pred)
        return dist, pred

    def distance(self, a: str, b: str) -> float:
        dist = self.tree(a)[0]
        if b not in dist:
            raise SimulationError(f"Узел {b} недостижим от {a} на планировке")
        return dist[b]

    def route(self, a: str, b: str) -> Route:
        key = (a, b)
        cached = self._routes.get(key)
        if cached is not None:
            return cached
        dist, pred = self.tree(a)
        if b not in dist:
            raise SimulationError(f"Узел {b} недостижим от {a} на планировке")
        nodes = [b]
        edges: list[str] = []
        while nodes[-1] != a:
            prev, edge = pred[nodes[-1]]
            edges.append(edge)
            nodes.append(prev)
        nodes.reverse()
        edges.reverse()
        route = Route(tuple(nodes), dist[b], self._chunks(nodes, edges))
        self._routes[key] = route
        return route

    def _chunks(self, nodes: list[str], edges: list[str]) -> tuple[Chunk, ...]:
        chunks: list[Chunk] = []
        start = 0
        lengths = [self.lengths[edge] for edge in edges]
        for i in range(1, len(edges) + 1):
            if i == len(edges) or self.segment_of.get(edges[i]) != self.segment_of.get(edges[start]):
                chunks.append(
                    Chunk(
                        tuple(nodes[start : i + 1]),
                        tuple(edges[start:i]),
                        sum(lengths[start:i]),
                        self.segment_of.get(edges[start]),
                    )
                )
                start = i
        return tuple(chunks)
