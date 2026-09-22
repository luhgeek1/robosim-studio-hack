from collections.abc import Iterable
from typing import Any

from app.db.models import Layout
from app.domain.layout.models import EdgeKind, NodeKind, RackOrientation, ZoneKind
from app.engine.layout import Edge, LayoutStats, Node, Plan, Rack, Zone
from app.engine.trace import TraceStep


def _point(point: Iterable[float]) -> list[float]:
    return [float(value) for value in point]


def zone_json(zone: Zone) -> dict[str, Any]:
    return {
        "id": zone.id,
        "kind": zone.kind.value,
        "name": zone.name,
        "polygon": [_point(p) for p in zone.polygon],
        "capacity": zone.capacity,
        "meta": dict(zone.meta),
    }


def rack_json(rack: Rack) -> dict[str, Any]:
    return {
        "id": rack.id,
        "polygon": [_point(p) for p in rack.polygon],
        "levels": rack.levels,
        "orientation": rack.orientation.value,
        "slots": rack.slots,
    }


def node_json(node: Node) -> dict[str, Any]:
    return {
        "id": node.id,
        "x": node.x,
        "y": node.y,
        "kind": node.kind.value,
        "zone_id": node.zone_id,
        "capacity": node.capacity,
        "label": node.label,
    }


def edge_json(edge: Edge) -> dict[str, Any]:
    return {
        "id": edge.id,
        "from": edge.source,
        "to": edge.target,
        "length_m": edge.length_m,
        "width_m": edge.width_m,
        "capacity": edge.capacity,
        "one_way": edge.one_way,
        "kind": edge.kind.value,
        "speed_limit_mps": edge.speed_limit_mps,
    }


def _polygon(raw: list[list[float]]) -> tuple[tuple[float, float], ...]:
    return tuple((float(p[0]), float(p[1])) for p in raw)


def zone_from(raw: dict[str, Any]) -> Zone:
    return Zone(
        raw["id"],
        ZoneKind(raw["kind"]),
        raw["name"],
        _polygon(raw["polygon"]),
        raw.get("capacity"),
        raw.get("meta") or {},
    )


def rack_from(raw: dict[str, Any]) -> Rack:
    return Rack(
        raw["id"],
        _polygon(raw["polygon"]),
        int(raw.get("levels") or 1),
        RackOrientation(raw.get("orientation") or RackOrientation.VERTICAL),
        raw.get("slots"),
    )


def node_from(raw: dict[str, Any]) -> Node:
    return Node(
        raw["id"],
        float(raw["x"]),
        float(raw["y"]),
        NodeKind(raw["kind"]),
        raw.get("zone_id"),
        raw.get("capacity"),
        raw.get("label"),
    )


def edge_from(raw: dict[str, Any]) -> Edge:
    return Edge(
        raw["id"],
        raw["from"],
        raw["to"],
        float(raw["length_m"]),
        float(raw["width_m"]),
        int(raw["capacity"]),
        bool(raw.get("one_way", False)),
        EdgeKind(raw.get("kind") or EdgeKind.RACK_AISLE),
        raw.get("speed_limit_mps"),
    )


def plan_from(layout: Layout) -> Plan:
    return Plan(
        layout.width_m,
        layout.height_m,
        tuple(zone_from(z) for z in layout.zones),
        tuple(rack_from(r) for r in layout.racks),
        tuple(node_from(n) for n in layout.nodes),
        tuple(edge_from(e) for e in layout.edges),
    )


def store_plan(layout: Layout, plan: Plan) -> None:
    layout.width_m = plan.width_m
    layout.height_m = plan.height_m
    layout.zones = [zone_json(z) for z in plan.zones]
    layout.racks = [rack_json(r) for r in plan.racks]
    layout.nodes = [node_json(n) for n in plan.nodes]
    layout.edges = [edge_json(e) for e in plan.edges]


def stats_json(summary: LayoutStats) -> dict[str, Any]:
    return {
        "avg_route_m": {key.value: route.value_m for key, route in summary.routes.items()},
        "routes": [
            {"key": key.value, "name": route.name, "value_m": route.value_m, "pairs": route.pairs}
            for key, route in summary.routes.items()
        ],
        "min_aisle_width_m": summary.min_aisle_width_m,
        "rack_slots_total": summary.rack_slots_total,
        "chargers": summary.chargers,
        "pick_stations": summary.pick_stations,
        "docks_in": summary.docks_in,
        "docks_out": summary.docks_out,
        "pods": summary.pods,
        "nodes": summary.nodes,
        "edges": summary.edges,
    }


def derivation_json(steps: Iterable[TraceStep]) -> list[dict[str, Any]]:
    return [
        {
            "key": step.key,
            "name": step.name,
            "value": step.value,
            "unit": step.unit,
            "formula": step.formula,
            "formula_rendered": step.rendered,
            "inputs": [
                {"key": q.key, "name": q.name, "value": q.value, "unit": q.unit, "kind": q.kind.value}
                for q in step.inputs
            ],
        }
        for step in steps
    ]
