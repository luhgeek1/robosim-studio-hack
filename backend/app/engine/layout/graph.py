import heapq
import math
from collections import defaultdict
from collections.abc import Callable, Iterable

from app.domain.layout.models import EdgeKind, NodeKind, RouteKey, ZoneKind
from app.engine.layout.models import Edge, LayoutError, LayoutStats, Node, Plan, RouteStat

# Sources for the storage → storage average: every k-th face so the cost stays bounded on big warehouses;
# the average is over all targets, only the starting faces are thinned.
INTERNAL_SOURCES_MAX = 48
# Pallet traffic aisles; goods-to-person lanes are sized by the pod, not by the pallet robot.
_AISLE_KINDS = frozenset({EdgeKind.MAIN_AISLE, EdgeKind.RACK_AISLE})
_ROUTE_NAMES = {
    RouteKey.DOCK_IN_TO_STORAGE: "Ворота приёмки → место хранения",
    RouteKey.STORAGE_TO_DOCK_OUT: "Место хранения → ворота отгрузки",
    RouteKey.STORAGE_TO_STORAGE: "Между местами хранения",
    RouteKey.POD_TO_STATION: "Стеллаж G2P → ближайшая станция отбора",
    RouteKey.STORAGE_TO_CHARGER: "Место хранения → ближайшая зарядка",
}


def distance(a: Node, b: Node) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


class Graph:
    """Route graph of a plan; edges are two-way unless marked one-way."""

    def __init__(self, plan: Plan, allow: Callable[[Edge], bool] | None = None) -> None:
        self.nodes = {node.id: node for node in plan.nodes}
        self.forward: dict[str, list[tuple[str, float]]] = defaultdict(list)
        self.backward: dict[str, list[tuple[str, float]]] = defaultdict(list)
        for edge in plan.edges:
            if allow is not None and not allow(edge):
                continue
            self.forward[edge.source].append((edge.target, edge.length_m))
            self.backward[edge.target].append((edge.source, edge.length_m))
            if not edge.one_way:
                self.forward[edge.target].append((edge.source, edge.length_m))
                self.backward[edge.source].append((edge.target, edge.length_m))

    def distances(self, sources: Iterable[str], *, reverse: bool = False) -> dict[str, float]:
        """Multi-source Dijkstra; `reverse` gives the distance from every node *to* the nearest source."""
        adjacency = self.backward if reverse else self.forward
        best: dict[str, float] = {}
        queue = [(0.0, source) for source in sources]
        heapq.heapify(queue)
        while queue:
            dist, node = heapq.heappop(queue)
            if node in best:
                continue
            best[node] = dist
            for target, length in adjacency[node]:
                if target not in best:
                    heapq.heappush(queue, (dist + length, target))
        return best


def _of_kind(plan: Plan, kind: NodeKind) -> list[Node]:
    return [node for node in plan.nodes if node.kind == kind]


def _weight(node: Node) -> float:
    return float(node.capacity or 1)


def _mean(pairs: list[tuple[float, float]]) -> float | None:
    total = sum(weight for _, weight in pairs)
    return sum(value * weight for value, weight in pairs) / total if total else None


def _between(graph: Graph, origins: list[Node], targets: list[Node], *, to_origin: bool) -> tuple[float, int]:
    """Mean over origins (used evenly) of the capacity-weighted mean distance to the targets."""
    means: list[float] = []
    pairs = 0
    for origin in origins:
        dist = graph.distances([origin.id], reverse=to_origin)
        reached = [(dist[t.id], _weight(t)) for t in targets if t.id in dist]
        mean = _mean(reached)
        if mean is not None:
            means.append(mean)
            pairs += len(reached)
    if not means:
        raise LayoutError("Маршрут не построен: места хранения недостижимы от ворот")
    return sum(means) / len(means), pairs


def _nearest(graph: Graph, sources: list[Node], targets: list[Node]) -> tuple[float, int] | None:
    if not sources or not targets:
        return None
    dist = graph.distances([s.id for s in sources], reverse=True)
    reached = [(dist[t.id], _weight(t)) for t in targets if t.id in dist]
    mean = _mean(reached)
    return (mean, len(reached)) if mean is not None else None


def _internal(graph: Graph, faces: list[Node]) -> tuple[float, int] | None:
    if len(faces) < 2:
        return None
    step = max(1, math.ceil(len(faces) / INTERNAL_SOURCES_MAX))
    samples: list[tuple[float, float]] = []
    pairs = 0
    for origin in faces[::step]:
        dist = graph.distances([origin.id])
        reached = [(dist[t.id], _weight(t)) for t in faces if t.id != origin.id and t.id in dist]
        mean = _mean(reached)
        if mean is not None:
            samples.append((mean, _weight(origin)))
            pairs += len(reached)
    mean = _mean(samples)
    return (mean, pairs) if mean is not None else None


def _pallet_edges(plan: Plan) -> Callable[[Edge], bool]:
    """Pallet robots do not cut through the goods-to-person field: its lanes carry pods, not pallets."""
    picking = {zone.id for zone in plan.zones if zone.kind == ZoneKind.PICKING}
    zone_of = {node.id: node.zone_id for node in plan.nodes}
    return lambda edge: not (zone_of.get(edge.source) in picking and zone_of.get(edge.target) in picking)


def routes(plan: Plan) -> dict[RouteKey, RouteStat]:
    pallets = Graph(plan, _pallet_edges(plan))
    everything = Graph(plan)
    faces = _of_kind(plan, NodeKind.RACK_FACE)
    docks_in, docks_out = _of_kind(plan, NodeKind.DOCK_IN), _of_kind(plan, NodeKind.DOCK_OUT)
    found: dict[RouteKey, tuple[float, int] | None] = {
        RouteKey.DOCK_IN_TO_STORAGE: _between(pallets, docks_in, faces, to_origin=False)
        if docks_in and faces
        else None,
        RouteKey.STORAGE_TO_DOCK_OUT: _between(pallets, docks_out, faces, to_origin=True)
        if docks_out and faces
        else None,
        RouteKey.STORAGE_TO_STORAGE: _internal(pallets, faces),
        RouteKey.POD_TO_STATION: _nearest(
            everything, _of_kind(plan, NodeKind.PICK_STATION), _of_kind(plan, NodeKind.PICKUP)
        ),
        RouteKey.STORAGE_TO_CHARGER: _nearest(pallets, _of_kind(plan, NodeKind.CHARGER), faces),
    }
    return {
        key: RouteStat(key, _ROUTE_NAMES[key], round(value[0], 1), value[1])
        for key, value in found.items()
        if value is not None
    }


def stats(plan: Plan) -> LayoutStats:
    widths = [edge.width_m for edge in plan.edges if edge.kind in _AISLE_KINDS]
    return LayoutStats(
        routes=routes(plan),
        min_aisle_width_m=min(widths) if widths else None,
        rack_slots_total=sum(rack.slots or 0 for rack in plan.racks),
        chargers=sum(node.capacity or 1 for node in _of_kind(plan, NodeKind.CHARGER)),
        pick_stations=len(_of_kind(plan, NodeKind.PICK_STATION)),
        docks_in=len(_of_kind(plan, NodeKind.DOCK_IN)),
        docks_out=len(_of_kind(plan, NodeKind.DOCK_OUT)),
        pods=sum(node.capacity or 0 for node in _of_kind(plan, NodeKind.PICKUP)),
        nodes=len(plan.nodes),
        edges=len(plan.edges),
    )


def validate(plan: Plan) -> list[dict[str, str]]:
    """Structural problems an edited plan must not have; each is {field, message}."""
    problems: list[dict[str, str]] = []
    ids = [node.id for node in plan.nodes]
    if len(ids) != len(set(ids)):
        problems.append({"field": "nodes", "message": "Идентификаторы узлов повторяются"})
    known = set(ids)
    edge_ids = [edge.id for edge in plan.edges]
    if len(edge_ids) != len(set(edge_ids)):
        problems.append({"field": "edges", "message": "Идентификаторы рёбер повторяются"})
    for edge in plan.edges:
        if edge.source not in known or edge.target not in known:
            problems.append(
                {"field": f"edges.{edge.id}", "message": "Ребро ссылается на несуществующий узел"}
            )
        if edge.length_m <= 0 or edge.width_m <= 0 or edge.capacity < 1:
            problems.append(
                {"field": f"edges.{edge.id}", "message": "Длина, ширина и вместимость ребра должны быть > 0"}
            )
    for node in plan.nodes:
        if not (0 <= node.x <= plan.width_m and 0 <= node.y <= plan.height_m):
            problems.append({"field": f"nodes.{node.id}", "message": "Узел за границами планировки"})
    if problems:
        return problems
    graph = Graph(plan)
    anchors = [n for n in plan.nodes if n.kind in {NodeKind.DOCK_IN, NodeKind.DOCK_OUT}] or list(plan.nodes)
    reached = graph.distances([anchors[0].id]).keys() if anchors else set()
    for node in plan.nodes:
        if node.kind != NodeKind.WAYPOINT and node.id not in reached:
            problems.append(
                {
                    "field": f"nodes.{node.id}",
                    "message": f"Узел «{node.label or node.id}» недостижим по графу",
                }
            )
    return problems
