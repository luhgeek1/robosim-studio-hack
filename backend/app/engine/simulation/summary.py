import math
from dataclasses import dataclass, field
from typing import Any

from app.engine.layout import Plan
from app.engine.simulation.models import (
    ProcessModel,
    ResourceKind,
    ResourceLoad,
    SimInput,
    SimRecord,
    State,
)
from app.engine.trace import fmt

SECONDS_PER_HOUR = 3600.0
SECONDS_PER_MINUTE = 60.0
PERCENT = 100.0
TOP_EDGES = 5
P95 = 0.95


@dataclass(frozen=True, slots=True)
class Bottleneck:
    resource_kind: str
    resource_id: str | None
    resource_name: str | None
    utilization: float | None
    explanation: str
    suggestion: str | None


@dataclass(frozen=True, slots=True)
class VsAnalytic:
    analytic_throughput_per_hour: float
    sim_throughput_per_hour: float
    delta_pct: float
    verdict: str
    text: str


@dataclass(frozen=True, slots=True)
class Summary:
    duration_hours: float
    demand_total: int
    completed: int
    completed_by_humans: int
    throughput_per_hour: float
    sla: dict[str, Any]
    utilization: dict[str, Any]
    queue: dict[str, Any]
    congestion: dict[str, Any]
    chargers: dict[str, Any]
    stations: dict[str, Any]
    bottleneck: Bottleneck
    vs_analytic: VsAnalytic | None
    per_process: list[dict[str, Any]]
    skipped: list[str] = field(default_factory=list)

    @property
    def sla_met(self) -> bool:
        return bool(self.sla["achieved_pct"] >= self.sla["target_pct"])


def _pct(share: float) -> str:
    return f"{fmt(round(share * PERCENT))} %"


def _percentile(values: list[float], share: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(share * len(ordered)) - 1)]


def _sla(record: SimRecord, inp: SimInput) -> dict[str, Any]:
    processes = {p.key: p for p in inp.processes}
    main = processes[record.processes[0].process_key] if record.processes else inp.processes[0]
    demand = sum(p.demand for p in record.processes)
    on_time = sum(p.on_time for p in record.processes)
    leads = [t for p in record.processes for t in p.lead_times_s]
    return {
        "kind": "on_time_share" if main.model == ProcessModel.GOODS_TO_PERSON else "lead_time",
        "target_value": round(main.lead_time_s / SECONDS_PER_MINUTE, 1),
        "target_unit": "мин",
        "target_pct": round(main.target_share * PERCENT, 1),
        "achieved_pct": round(PERCENT * on_time / demand, 2) if demand else PERCENT,
        "late_count": demand - on_time,
        "avg_lead_time_min": round(sum(leads) / len(leads) / SECONDS_PER_MINUTE, 2) if leads else 0.0,
        "p95_lead_time_min": round(_percentile(leads, P95) / SECONDS_PER_MINUTE, 2),
    }


def _utilization(record: SimRecord) -> dict[str, Any]:
    total = sum(record.state_seconds.values()) or 1.0
    shares = {state.value: round(record.state_seconds.get(state.value, 0.0) / total, 4) for state in State}
    productive = shares["moving"] + shares["loading"] + shares["unloading"]
    return {
        "fleet": round(productive, 4),
        "by_state": shares,
        "per_robot": [
            {
                "robot_id": r.robot_id,
                "utilization": round(r.utilization, 4),
                "tasks": r.tasks,
                "distance_km": r.distance_km,
                "charges": r.charges,
            }
            for r in record.robots
        ],
    }


def _queue(record: SimRecord, warmup_s: float) -> dict[str, Any]:
    points = [p for p in record.timeline if p.t_min * SECONDS_PER_MINUTE >= warmup_s] or record.timeline
    if not points:
        return {"avg": 0.0, "max": 0, "at_end": 0, "max_at_hour": 0.0}
    peak = max(points, key=lambda p: p.queue)
    return {
        "avg": round(sum(p.queue for p in points) / len(points), 2),
        "max": peak.queue,
        "at_end": points[-1].queue,
        "max_at_hour": round(peak.t_min / SECONDS_PER_MINUTE, 2),
    }


def _group(resources: list[ResourceLoad], kind: ResourceKind) -> dict[str, Any]:
    own = [r for r in resources if r.kind == kind]
    return {
        "count": len(own),
        "utilization": round(sum(r.utilization for r in own) / len(own), 4) if own else 0.0,
        "queue_max": max((r.queue_max for r in own), default=0),
    }


def _congestion(record: SimRecord, edge_names: dict[str, str]) -> dict[str, Any]:
    total = sum(record.edge_wait_s.values())
    top = sorted(record.edge_wait_s.items(), key=lambda item: item[1], reverse=True)[:TOP_EDGES]
    return {
        "total_wait_hours": round(total / SECONDS_PER_HOUR, 3),
        "top_edges": [
            {
                "edge_id": edge,
                "name": edge_names.get(edge, edge),
                "wait_s": round(wait, 1),
                "share": round(wait / total, 3) if total else 0.0,
            }
            for edge, wait in top
        ],
    }


_ADVICE = {
    ResourceKind.FLEET: (
        "Роботы заняты {u} времени — парк работает на пределе, очередь задач растёт",
        "Добавить робота или сгладить пик: перенести часть приёмки из пикового окна",
    ),
    ResourceKind.AISLE: (
        "{name} занят {u} времени: однополосный проход держит одного робота, остальные ждут въезда",
        "Развести приёмку и отгрузку по разным проходам или расширить проход — новые роботы усилят затор",
    ),
    ResourceKind.DOCK: (
        "{name} заняты погрузкой {u} времени — роботы ждут у ворот",
        "Добавить ворота или буфер у ворот, чтобы роботы забирали паллеты с нескольких мест",
    ),
    ResourceKind.PICK_STATION: (
        "{name} загружена на {u}: добавление роботов не поможет — станция не успевает отбирать",
        "Добавить станцию отбора или поднять выработку оператора",
    ),
    ResourceKind.CHARGER: (
        "{name} занята {u} времени, очередь на зарядку до {q} роботов",
        "Добавить зарядную станцию",
    ),
    ResourceKind.ELEVATOR: (
        "{name} заняты роботами {u} времени, в очереди к лифтам до {q} роботов",
        "Выделить роботам грузовой лифт или развести рейсы по времени — новые роботы будут ждать лифт",
    ),
}


def _bottleneck(record: SimRecord, inp: SimInput, sla_met: bool, fleet_busy: float) -> Bottleneck:
    candidates = [
        (ResourceKind.FLEET, None, "Парк роботов", fleet_busy, 0),
        *((r.kind, r.resource_id, r.name, r.utilization, r.queue_max) for r in record.resources),
    ]
    kind, resource_id, name, utilization, queue = max(candidates, key=lambda c: c[3])
    threshold = inp.settings.bottleneck_utilization
    if sla_met and utilization < threshold:
        return Bottleneck(
            ResourceKind.NONE.value,
            None,
            None,
            round(utilization, 3),
            f"Узких мест нет: самый загруженный ресурс — {name.lower()} ({_pct(utilization)}), "
            f"порог {_pct(threshold)}",
            None,
        )
    explanation, suggestion = _ADVICE[kind]
    return Bottleneck(
        kind.value,
        resource_id,
        name,
        round(utilization, 3),
        explanation.format(name=name, u=_pct(utilization), q=queue),
        suggestion,
    )


def _vs_analytic(record: SimRecord, inp: SimInput, sla: dict[str, Any], note: str) -> VsAnalytic | None:
    processes = {p.key: p for p in inp.processes}
    for outcome in record.processes:
        process = processes[outcome.process_key]
        if not process.analytic_per_robot_h or not outcome.mean_cycle_s:
            continue
        units = {
            ProcessModel.GOODS_TO_PERSON: process.lines_per_trip,
            ProcessModel.TOW_TRAIN: math.floor(process.units_per_trip),
        }.get(process.model, process.units_per_trip if process.sources else 1.0)
        per_robot = (
            SECONDS_PER_HOUR
            / outcome.mean_cycle_s
            * units
            * outcome.availability
            * inp.settings.utilization_target
        )
        analytic = outcome.robots * process.analytic_per_robot_h
        simulated = outcome.robots * per_robot
        delta = (simulated / analytic - 1) * PERCENT if analytic else 0.0
        met = sla["achieved_pct"] >= sla["target_pct"]
        head = "Имитация подтверждает расчёт" if met else "Имитация не подтверждает расчёт"
        sign = "+" if delta >= 0 else "−"
        text = (
            f"{head}: {fmt(round(simulated))} ед/ч против {fmt(round(analytic))} по циклу "
            f"({sign}{fmt(abs(round(delta)))} %) при {outcome.robots} роботах, "
            f"SLA {fmt(round(sla['achieved_pct'], 1))} % при цели {fmt(sla['target_pct'])} %"
        )
        return VsAnalytic(
            round(analytic, 1),
            round(simulated, 1),
            round(delta, 1),
            "confirmed" if met else "shortfall",
            text if met else f"{text}. {note}",
        )
    return None


def summarize(record: SimRecord, inp: SimInput, edge_names: dict[str, str]) -> Summary:
    warmup = inp.settings.warmup_s
    lead = max((p.lead_time_s for p in inp.processes), default=0.0)
    # The KPI window: after the warm-up and early enough for the last units to finish within the lead time.
    measured_h = max(record.duration_s - warmup - lead, 1.0) / SECONDS_PER_HOUR
    sla = _sla(record, inp)
    utilization = _utilization(record)
    sla_met = sla["achieved_pct"] >= sla["target_pct"]
    # Waiting at a station, a door or an aisle is not fleet work: that time points at the other resource.
    bottleneck = _bottleneck(record, inp, sla_met, utilization["fleet"])
    completed = sum(p.completed for p in record.processes)
    return Summary(
        duration_hours=round(record.duration_s / SECONDS_PER_HOUR, 2),
        demand_total=sum(p.demand for p in record.processes),
        completed=completed,
        completed_by_humans=sum(p.by_humans for p in record.processes),
        throughput_per_hour=round(completed / measured_h, 2),
        sla=sla,
        utilization=utilization,
        queue=_queue(record, warmup),
        congestion=_congestion(record, edge_names),
        chargers={**_group(record.resources, ResourceKind.CHARGER), "energy_kwh": None},
        stations=_group(record.resources, ResourceKind.PICK_STATION),
        bottleneck=bottleneck,
        vs_analytic=_vs_analytic(record, inp, sla, bottleneck.explanation),
        per_process=[
            {
                "process_key": p.process_key,
                "robots": p.robots,
                "completed": p.completed,
                "sla_achieved_pct": round(PERCENT * p.on_time / p.demand, 2) if p.demand else PERCENT,
                "utilization": round(p.utilization, 4),
            }
            for p in record.processes
        ],
        skipped=record.skipped,
    )


def heatmap(record: SimRecord, plan: Plan) -> dict[str, Any]:
    peak = max(record.edge_traffic.values(), default=0) or 1
    edges = [
        {
            "edge_id": edge,
            "traffic": traffic,
            "wait_s": round(record.edge_wait_s.get(edge, 0.0), 1),
            "intensity": round(traffic / peak, 3),
        }
        for edge, traffic in sorted(record.edge_traffic.items())
    ]
    zone_of = {node.id: node.zone_id for node in plan.nodes}
    by_zone: dict[str, list[float]] = {}
    for resource in record.resources:
        zone = zone_of.get(resource.resource_id)
        if zone:
            by_zone.setdefault(zone, []).append(resource.utilization)
    zones = [
        {"zone_id": zone, "occupancy": round(sum(values) / len(values), 3), "queue_avg": None}
        for zone, values in sorted(by_zone.items())
    ]
    waits = {r.resource_id: r.wait_s for r in record.resources}
    nodes = [
        {"node_id": node, "visits": visits, "wait_s": round(waits.get(node, 0.0), 1)}
        for node, visits in sorted(record.node_visits.items())
    ]
    return {"edges": edges, "zones": zones, "nodes": nodes}
