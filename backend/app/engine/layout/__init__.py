from collections.abc import Mapping

from app.domain.layout.models import LayoutTemplate
from app.engine.layout.dimensions import OVERRIDES, REQUIRED_PARAMS, Deriver, Inputs
from app.engine.layout.graph import Graph, stats, validate
from app.engine.layout.models import (
    Edge,
    Generated,
    LayoutError,
    LayoutStats,
    Node,
    Plan,
    Rack,
    RouteStat,
    Zone,
)
from app.engine.layout.warehouse import WarehouseDrawer
from app.engine.trace import Book, Tracer

__all__ = [
    "OVERRIDES",
    "REQUIRED_PARAMS",
    "Edge",
    "Generated",
    "Graph",
    "LayoutError",
    "LayoutStats",
    "Node",
    "Plan",
    "Rack",
    "RouteStat",
    "Zone",
    "generate",
    "stats",
    "validate",
]


def generate(
    template: LayoutTemplate,
    params: Book,
    norms: Book,
    overrides: Mapping[str, float] | None = None,
    *,
    render: bool = True,
) -> Generated:
    """Warehouse plan from object parameters and layout norms; every dimension is a traced step.

    The plan is a schematic, not CAD: it exists to give the cycle model real route lengths and the simulation
    a graph with aisle widths, docks, stations and chargers.
    """
    inputs = Inputs(params, norms, overrides or {})
    tracer = Tracer(render=render)
    deriver = Deriver(template, inputs, tracer)
    dims = deriver.derive()
    drawer = WarehouseDrawer(dims)
    plan = drawer.draw()
    return Generated(template, plan, tracer.steps, [*deriver.warnings, *drawer.warnings], dict(inputs.used))
