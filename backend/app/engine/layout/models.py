from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from app.domain.layout.models import EdgeKind, LayoutTemplate, NodeKind, RackOrientation, RouteKey, ZoneKind
from app.engine.trace import TraceStep

Point = tuple[float, float]


class LayoutError(ValueError):
    """The layout cannot be built or accepted as given — the message tells the user what to change."""

    def __init__(self, message: str, details: list[dict[str, Any]] | None = None) -> None:
        super().__init__(message)
        self.details = details or []


@dataclass(frozen=True, slots=True)
class Zone:
    id: str
    kind: ZoneKind
    name: str
    polygon: tuple[Point, ...]
    capacity: int | None = None
    meta: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Rack:
    id: str
    polygon: tuple[Point, ...]
    levels: int
    orientation: RackOrientation
    slots: int | None


@dataclass(frozen=True, slots=True)
class Node:
    id: str
    x: float
    y: float
    kind: NodeKind
    zone_id: str | None = None
    capacity: int | None = None
    label: str | None = None


@dataclass(frozen=True, slots=True)
class Edge:
    id: str
    source: str
    target: str
    length_m: float
    width_m: float
    capacity: int
    one_way: bool = False
    kind: EdgeKind = EdgeKind.RACK_AISLE
    speed_limit_mps: float | None = None


@dataclass(frozen=True, slots=True)
class Plan:
    width_m: float
    height_m: float
    zones: tuple[Zone, ...]
    racks: tuple[Rack, ...]
    nodes: tuple[Node, ...]
    edges: tuple[Edge, ...]


@dataclass(frozen=True, slots=True)
class RouteStat:
    key: RouteKey
    name: str
    value_m: float
    pairs: int


@dataclass(frozen=True, slots=True)
class LayoutStats:
    routes: Mapping[RouteKey, RouteStat]
    min_aisle_width_m: float | None
    rack_slots_total: int
    chargers: int
    pick_stations: int
    docks_in: int
    docks_out: int
    pods: int
    nodes: int
    edges: int


@dataclass(frozen=True, slots=True)
class Generated:
    template: LayoutTemplate
    plan: Plan
    derivation: list[TraceStep]
    warnings: list[str]
    inputs: dict[str, float]
