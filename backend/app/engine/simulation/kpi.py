from collections.abc import Generator
from typing import Any

import simpy

from app.engine.simulation.model import SAMPLE_S, Model
from app.engine.simulation.models import ProcessOutcome, RobotStats, SimRecord, State, TimelinePoint

SECONDS_PER_MINUTE = 60.0
METERS_PER_KM = 1000.0
PERCENT = 100.0
PRODUCTIVE = frozenset({State.MOVING, State.LOADING, State.UNLOADING})


def sampler(model: Model) -> Generator[simpy.Event, Any]:
    """Once a minute: cumulative demand and completions, queue and fleet state — the KPI timeline."""
    while True:
        counters = model.counters
        queue = sum(t.units for q in model.queues.values() for t in q) + sum(
            len(b) for b in model.batches.values()
        )
        states = [robot.state for robot in model.robots]
        fleet = len(states) or 1
        model.timeline.append(
            TimelinePoint(
                t_min=round(model.env.now / SECONDS_PER_MINUTE, 2),
                done=counters.done,
                demand_cum=counters.created,
                queue=queue,
                sla_running_pct=round(PERCENT * counters.on_time_window / counters.done_window, 2)
                if counters.done_window
                else PERCENT,
                utilization=round(sum(s in PRODUCTIVE for s in states) / fleet, 3),
                charging=sum(s == State.CHARGING for s in states),
                failed=sum(s == State.FAILED for s in states),
                late_cum=counters.late,
            )
        )
        yield model.env.timeout(SAMPLE_S)


def _outcome(model: Model, key: str) -> ProcessOutcome:
    """KPI window: units created after the warm-up and early enough to be finished within the lead time."""
    lead = model.lead_s[key]
    start, stop = model.inp.settings.warmup_s, model.end_s - lead
    finished = [(c, t, h) for c, t, h in model.units[key] if start <= c <= stop]
    created = [t for t in model.tasks if t.process == key]
    open_units = sum(
        len([c for c in t.lines if start <= c <= stop]) if t.lines else int(start <= t.created <= stop)
        for t in created
        if t.open
    )
    open_units += sum(1 for c in model.batches[key] if start <= c <= stop)
    by_humans = sum(1 for _, _, h in finished if h)
    on_time = sum(1 for _, t, h in finished if not h and t <= lead)
    demand = len(finished) + open_units
    robots = [r for r in model.robots if r.process.key == key]
    total = sum(sum(r.seconds.values()) for r in robots) or 1.0
    productive = sum(r.seconds.get(s, 0.0) for r in robots for s in PRODUCTIVE)
    down = sum(r.seconds.get(State.CHARGING, 0.0) + r.seconds.get(State.FAILED, 0.0) for r in robots)
    cycles = [c for r in robots for c in r.cycles]
    return ProcessOutcome(
        process_key=key,
        robots=len(robots),
        demand=demand,
        completed=len(finished) - by_humans,
        by_humans=by_humans,
        on_time=on_time,
        late=demand - on_time,
        lead_times_s=tuple(t for _, t, h in finished if not h),
        utilization=productive / total,
        mean_cycle_s=sum(cycles) / len(cycles) if cycles else None,
        availability=1 - down / total,
    )


def record(model: Model) -> SimRecord:
    duration = model.end_s
    states: dict[str, float] = {}
    for robot in model.robots:
        for state, seconds in robot.seconds.items():
            states[state.value] = states.get(state.value, 0.0) + seconds
    resources = [
        resource.load(duration, model.end_s)
        for group in (model.segments, model.docks, model.stations, model.chargers, model.lifts)
        for resource in group.values()
    ]
    robots = [
        RobotStats(
            robot_id=r.id,
            process_key=r.process.key,
            utilization=sum(r.seconds.get(s, 0.0) for s in PRODUCTIVE) / (sum(r.seconds.values()) or 1.0),
            tasks=r.tasks,
            distance_km=round(r.distance_m / METERS_PER_KM, 2),
            charges=r.charges,
        )
        for r in model.robots
    ]
    return SimRecord(
        duration_s=duration,
        processes=[_outcome(model, p.key) for p in model.processes],
        robots=robots,
        state_seconds=states,
        resources=resources,
        edge_traffic=dict(model.edge_traffic),
        edge_wait_s=dict(model.edge_wait),
        node_visits=dict(model.node_visits),
        timeline=model.timeline,
        events=sorted(model.events, key=lambda e: e.t),
        robot_meta=[
            (r.id, r.process.key, r.process.product_name, r.process.robot.speed_mps, model.homes[r.id])
            for r in model.robots
        ],
        skipped=list(model.skipped),
    )
