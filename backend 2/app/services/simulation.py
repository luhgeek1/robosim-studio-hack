"""Discrete-event simulation of the pallet flow (SimPy).

Tasks (pallet moves) arrive following the hourly profile; robots (or manual operators)
pick them up in FIFO order and run a four-leg cycle receiving -> storage -> picking ->
shipping. Tasks waiting longer than the escalation limit are handed to manual handling
(counted as an SLA miss). The model is causal, not physically exact (PROJECT_CONTEXT §16).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import simpy

from ..models import Robot
from ..schemas import SimEvent, SimKpis
from .catalog import spec_value
from .site import MANUAL_PALLETS_PER_OPERATOR_H, Site
from .sizing import CONGESTION, effective_throughput, fleet_capacity

LEGS = [("receiving", "storage", 0.36), ("storage", "picking", 0.24), ("picking", "shipping", 0.22), ("shipping", "receiving", 0.18)]
ESCALATE_FACTOR = 3.0  # tasks waiting longer than 3× the SLA window are handed to people
BATCH_MIN, BATCH_MAX = 4, 16
PEAK_HOURS = 8
MAX_EVENTS = 600


@dataclass
class _Stats:
    completed: int = 0
    on_time: int = 0
    escalated: int = 0
    busy_min: float = 0.0
    leg_busy: dict[str, float] = field(default_factory=lambda: {"receiving": 0.0, "storage": 0.0, "picking": 0.0, "shipping": 0.0})
    queue_samples: list[int] = field(default_factory=list)
    events: list[SimEvent] = field(default_factory=list)


def _arrival_rates(site: Site, mode: str) -> list[float]:
    if mode == "peak":
        return [site.peak_rate] * PEAK_HOURS
    return list(site.profile)


def run(site: Site, servers: int, cycle_min: float, mode: str, battery_h: float | None, charge_min: float, seed: int, label: str = "R") -> tuple[SimKpis, list[SimEvent]]:
    rng = random.Random(seed)
    env = simpy.Environment()
    rates = _arrival_rates(site, mode)
    horizon = 60 * len(rates)
    queue = simpy.Store(env)
    st = _Stats()
    sla_window = site.sla_window_min

    def arrivals():
        # pallets arrive in batches (truck unloading, WMS order waves) paced to follow the
        # hourly profile; bursts are what create queues even when average capacity is fine
        while env.now < horizon:
            hour = int(env.now // 60) % len(rates)
            rate_min = rates[hour] / 60
            if rate_min <= 0:
                yield env.timeout(1)
                continue
            size = rng.randint(BATCH_MIN, BATCH_MAX)
            for _ in range(size):
                queue.put(env.now)
            gap = size / rate_min * rng.uniform(0.6, 1.4)
            yield env.timeout(max(0.2, gap))

    def janitor():
        # escalate tasks that waited too long: they still get handled, by people
        while True:
            yield env.timeout(5)
            keep = []
            for t in queue.items:
                if env.now - t > sla_window * ESCALATE_FACTOR:
                    st.escalated += 1
                else:
                    keep.append(t)
            if len(keep) != len(queue.items):
                queue.items[:] = keep
            st.queue_samples.append(len(queue.items))

    def robot(idx: int):
        rid = f"{label}{idx + 1}"
        worked = 0.0
        while True:
            if battery_h and worked >= battery_h * 60:
                _emit(st, env.now, rid, "charging", None, "charging", len(queue.items))
                yield env.timeout(charge_min)
                worked = 0.0
            arrived = yield queue.get()
            wait = env.now - arrived
            cycle = max(cycle_min * 0.4, rng.gauss(cycle_min, cycle_min * 0.2))
            for frm, to, share in LEGS:
                _emit(st, env.now, rid, "moving", frm, to, len(queue.items))
                dt = cycle * share
                yield env.timeout(dt)
                st.leg_busy[frm] += dt
            st.busy_min += cycle
            worked += cycle
            st.completed += 1
            if wait + cycle * LEGS[0][2] <= sla_window:
                st.on_time += 1
            _emit(st, env.now, rid, "idle", "shipping", None, len(queue.items))

    env.process(arrivals())
    env.process(janitor())
    for i in range(servers):
        env.process(robot(i))
    env.run(until=horizon)

    total = st.completed + st.escalated
    hours = horizon / 60
    sla = 100 * st.on_time / total if total else 100.0
    util = 100 * st.busy_min / (servers * horizon) if servers else 0.0
    q_avg = sum(st.queue_samples) / len(st.queue_samples) if st.queue_samples else 0.0
    q_max = max(st.queue_samples) if st.queue_samples else 0
    leg_total = sum(st.leg_busy.values()) or 1.0
    zones = _zone_loads(util / 100, q_avg, st.leg_busy, leg_total)
    kpis = SimKpis(throughput=0.0, processed_per_hour=round(st.completed / hours, 1), queue_avg=round(q_avg, 1), queue_max=q_max,
                   utilization=round(util, 1), sla=round(sla, 1), escalated=st.escalated, zones=zones, robots=servers, load_mode=mode)
    return kpis, _downsample(st.events)


def _zone_loads(util: float, q_avg: float, leg_busy: dict[str, float], leg_total: float) -> list[float]:
    share = {k: v / leg_total for k, v in leg_busy.items()}
    receiving = min(1.0, 0.22 + 0.5 * util + q_avg / 45)
    storage = min(1.0, 0.15 + 0.55 * util + share["storage"] * 0.3)
    picking = min(1.0, 0.2 + 0.6 * util + q_avg / 120)
    shipping = min(1.0, 0.1 + 0.5 * util)
    return [round(x, 2) for x in (receiving, storage, picking, shipping)]


def _poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    l, k, p = pow(2.718281828, -lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def _emit(st: _Stats, t: float, rid: str, state: str, frm: str | None, to: str | None, q: int):
    st.events.append(SimEvent(time=round(t, 1), robot_id=rid, state=state, **{"from": frm}, to=to, queue=q))


def _downsample(events: list[SimEvent]) -> list[SimEvent]:
    if len(events) <= MAX_EVENTS:
        return events
    step = len(events) / MAX_EVENTS
    return [events[int(i * step)] for i in range(MAX_EVENTS)]


def simulate_robots(robot: Robot, n: int, site: Site, mode: str, seed: int) -> tuple[SimKpis, list[SimEvent]]:
    eff = effective_throughput(robot, site)
    cycle = 60 / max(0.1, eff) * (1 + CONGESTION * (n - 1))
    battery = float(spec_value(robot, "battery_hours", 8))
    charge = float(spec_value(robot, "charge_min", 60))
    kpis, events = run(site, n, cycle, mode, battery, charge, seed + n * 7 + (1 if mode == "peak" else 0))
    kpis.throughput = fleet_capacity(eff, n)
    return kpis, events


def simulate_manual(site: Site, mode: str, seed: int) -> SimKpis:
    servers = max(1, round(site.operators_per_shift))
    cycle = 60 / (MANUAL_PALLETS_PER_OPERATOR_H * (1 - site.time_loss))
    kpis, _ = run(site, servers, cycle, mode, None, 0, seed + 99, label="M")
    kpis.throughput = round(site.manual_capacity, 1)
    return kpis
