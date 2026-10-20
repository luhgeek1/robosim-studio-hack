from collections.abc import Callable, Generator
from dataclasses import dataclass
from typing import Any

import simpy

from app.engine.layout import Plan
from app.engine.layout.graph import pallet_edges
from app.engine.simulation.kpi import record, sampler
from app.engine.simulation.model import Model
from app.engine.simulation.models import (
    Dispatch,
    Failure,
    ProcessModel,
    RobotSpec,
    SimConfig,
    SimInput,
    SimMode,
    SimProcess,
    SimRecord,
    SimSettings,
    SimulationError,
)
from app.engine.simulation.network import Network, Segment, narrow_segments
from app.engine.simulation.settings import settings_from
from app.engine.simulation.summary import Summary, heatmap, summarize

__all__ = [
    "Dispatch",
    "Failure",
    "Prepared",
    "ProcessModel",
    "RobotSpec",
    "SimConfig",
    "SimInput",
    "SimMode",
    "SimProcess",
    "SimResult",
    "SimSettings",
    "SimulationError",
    "prepare",
    "settings_from",
    "simulate",
]


@dataclass(frozen=True, slots=True)
class Prepared:
    """Routing structures of one layout, shared by the runs of a fleet sweep."""

    plan: Plan
    segments: list[Segment]
    pallet_net: Network
    full_net: Network
    edge_names: dict[str, str]


@dataclass(frozen=True, slots=True)
class SimResult:
    record: SimRecord
    summary: Summary
    heatmap: dict[str, Any]


def prepare(plan: Plan, two_way_width_m: float) -> Prepared:
    segments = narrow_segments(plan, two_way_width_m)
    names = {edge: segment.name for segment in segments for edge in segment.edges}
    return Prepared(
        plan,
        segments,
        Network(plan, segments, pallet_edges(plan)),
        Network(plan, segments),
        names,
    )


def simulate(
    inp: SimInput, prepared: Prepared | None = None, progress: Callable[[float], None] | None = None
) -> SimResult:
    """Discrete-event run of the scenario's fleets on the layout graph (D-007).

    Robots hold one-lane aisle segments, doors, pick stations and chargers as resources; tasks come from
    trucks at the doors and from order lines; batteries, failures and hand-over to people are modelled.
    Deterministic for a given seed.
    """
    ready = prepared or prepare(inp.plan, inp.settings.two_way_width_m)
    model = Model(inp, ready.pallet_net, ready.full_net, ready.segments)
    if not model.processes:
        raise SimulationError(
            "В сценарии нет процессов, которые умеет имитировать платформа (перевозка паллет, G2P)"
        )

    def observed_sampler(model: Model) -> Generator[simpy.Event, Any]:
        for event in sampler(model):
            if progress:
                progress(model.env.now / model.end_s)
            yield event

    model.run(observed_sampler if progress else sampler)
    raw = record(model)
    result = SimResult(raw, summarize(raw, inp, ready.edge_names), heatmap(raw, inp.plan))
    if progress:
        progress(1.0)
    return result


def run_progress(callback: Callable[[float, str], None] | None, stage: str) -> Callable[[float], None] | None:
    """Bind a run label without changing the observer's fraction of simulated time."""
    return (lambda fraction: callback(fraction, stage)) if callback else None
