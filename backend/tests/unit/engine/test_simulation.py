import time
from dataclasses import replace
from functools import cache

import pytest

from app.domain.layout.models import LayoutTemplate, NodeKind
from app.engine.layout import Plan, generate
from app.engine.simulation import (
    Failure,
    Prepared,
    ProcessModel,
    RobotSpec,
    SimConfig,
    SimInput,
    SimMode,
    SimProcess,
    SimulationError,
    prepare,
    settings_from,
    simulate,
)
from app.engine.simulation.sweep import Sweep
from app.engine.trace import Book, InputKind
from app.seeds.schemas import load_norm_set

NORMS = Book.of(InputKind.NORM, [(n.key, n.name, n.value, n.unit) for n in load_norm_set().norms])
SETTINGS = settings_from(NORMS)
DEMO = {
    "area_m2": 20_000.0,
    "ceiling_height_m": 10.0,
    "aisle_width_m": 2.8,
    "main_aisle_width_m": 3.5,
    "pallet_positions": 20_000.0,
    "pallets_in_per_day": 1000.0,
    "pallets_out_per_day": 1000.0,
    "shifts_per_day": 2.0,
    "shift_hours": 11.0,
    "peak_factor": 1.5,
    "order_lines_per_day": 20_000.0,
}
PALLETS = SimProcess(
    key="pallet_transport",
    name="Перемещение паллет",
    model=ProcessModel.TRANSPORT,
    product_name="AMR",
    robots=14,
    # 1.5 m/s passport × 0.6 effective speed factor, 30 s load and unload, 10 h runtime / 18 min charge.
    robot=RobotSpec(speed_mps=0.9, load_s=30, unload_s=30, runtime_h=10, charge_min=18),
    hours_per_day=22,
    peak_factor=1.5,
    lead_time_s=20 * 60,
    target_share=0.95,
    inbound_per_day=1000,
    outbound_per_day=1000,
    analytic_robots=14,
    analytic_per_robot_h=10.34,
)
PICKING = SimProcess(
    key="order_picking",
    name="Отбор",
    model=ProcessModel.GOODS_TO_PERSON,
    product_name="G2P",
    robots=40,
    robot=RobotSpec(speed_mps=0.9, load_s=30, unload_s=30),
    hours_per_day=22,
    peak_factor=1.5,
    lead_time_s=30 * 60,
    target_share=0.95,
    lines_per_day=20_000,
    lines_per_trip=3,
    station_lines_per_hour=300,
    stations=6,
    analytic_robots=40,
    analytic_per_robot_h=44,
)


@cache
def layout() -> tuple[Plan, Prepared]:
    params = Book.of(InputKind.PARAM, [(k, k, v, None) for k, v in DEMO.items()])
    plan = generate(LayoutTemplate.WAREHOUSE_U_FLOW, params, NORMS).plan
    return plan, prepare(plan, SETTINGS.two_way_width_m)


def run(process: SimProcess = PALLETS, **config: object):  # type: ignore[no-untyped-def]
    plan, prepared = layout()
    options = {"mode": SimMode.PEAK, "seed": 3, **config}
    return simulate(SimInput(plan, (process,), SETTINGS, SimConfig(**options)), prepared)  # type: ignore[arg-type]


def test_analytic_fleet_holds_the_peak_and_matches_the_cycle_model() -> None:
    summary = run().summary
    assert summary.sla["achieved_pct"] >= 95
    assert summary.completed > 0
    assert summary.completed_by_humans == 0
    assert summary.vs_analytic is not None
    assert summary.vs_analytic.verdict == "confirmed"
    # DES and the cycle formula describe the same robot on the same route: within ±15 %.
    assert abs(summary.vs_analytic.delta_pct) < 15


def test_small_fleet_misses_sla_and_the_fleet_is_the_bottleneck() -> None:
    summary = run(fleet={"pallet_transport": 5}).summary
    assert summary.sla["achieved_pct"] < 95
    assert summary.bottleneck.resource_kind == "fleet"
    assert summary.vs_analytic is not None
    assert summary.vs_analytic.verdict == "shortfall"
    assert summary.queue["max"] > 20


def test_runs_are_reproducible_and_share_demand_across_fleets() -> None:
    first, again = run().summary, run().summary
    assert first == again
    other = run(fleet={"pallet_transport": 9}).summary
    assert other.demand_total == first.demand_total


def test_narrow_aisles_are_one_robot_resources_with_recorded_waits() -> None:
    _, prepared = layout()
    assert prepared.segments
    result = run(fleet={"pallet_transport": 20})
    aisles = [r for r in result.record.resources if r.kind == "aisle"]
    assert len(aisles) == len(prepared.segments)
    assert sum(r.wait_s for r in aisles) > 0
    assert result.summary.congestion["top_edges"]


def test_events_describe_moves_on_the_layout_graph() -> None:
    plan, _ = layout()
    events = run().record.events
    nodes = {node.id for node in plan.nodes}
    moves = [e for e in events if e.type == "move"]
    assert moves
    assert all(set(e.path) <= nodes and e.eta is not None and e.eta >= e.t for e in moves)
    assert [e.t for e in events] == sorted(e.t for e in events)
    assert {"load", "unload", "task_assigned", "task_done"} <= {e.type for e in events}


def test_forced_failure_takes_a_robot_out() -> None:
    result = run(failures=(Failure(at_s=3600, duration_s=1800, robot_index=0),))
    assert result.summary.utilization["by_state"]["failed"] > 0
    assert any(e.type == "fail" and e.robot_id == "R01" for e in result.record.events)


def test_charging_uses_the_scenario_charger_count() -> None:
    few = run(fleet={"pallet_transport": 20}, chargers=1, duration_h=8.0).summary
    many = run(fleet={"pallet_transport": 20}, chargers=20, duration_h=8.0).summary
    assert few.chargers["queue_max"] >= many.chargers["queue_max"]


def test_goods_to_person_stations_limit_the_flow() -> None:
    enough = run(PICKING).summary
    assert enough.stations["count"] == 6
    assert enough.completed > 0
    starved = run(PICKING, stations={"order_picking": 1}).summary
    assert starved.sla["achieved_pct"] < enough.sla["achieved_pct"]
    assert starved.bottleneck.resource_kind == "pick_station"


def test_normal_day_follows_the_daily_volume() -> None:
    summary = run(mode=SimMode.NORMAL).summary
    # 2 000 pallets a day, minus the warm-up and the tail that cannot finish within the lead time.
    assert 1700 < summary.demand_total < 2100


def test_unsupported_processes_are_skipped_and_empty_runs_rejected() -> None:
    cleaning = replace(PALLETS, key="floor_cleaning", model="area_coverage")  # type: ignore[arg-type]
    with pytest.raises(SimulationError):
        run(cleaning)
    plan, _ = layout()
    no_g2p = replace(plan, nodes=tuple(n for n in plan.nodes if n.kind != NodeKind.PICK_STATION))
    with pytest.raises(SimulationError, match="товар к человеку"):
        simulate(SimInput(no_g2p, (PICKING,), SETTINGS, SimConfig(mode=SimMode.PEAK)), prepare(no_g2p, 2.9))


def test_fleet_sweep_finds_the_smallest_fleet_meeting_sla() -> None:
    plan, prepared = layout()
    inp = SimInput(plan, (PALLETS,), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=1))
    result = Sweep(inp, "pallet_transport", 3, prepared).run()
    assert result.recommended_count is not None
    points = {p.count: p for p in result.points}
    assert points[result.recommended_count].passed
    assert not points[result.recommended_count - 1].passed
    assert result.recommended_count <= PALLETS.analytic_robots
    assert "минимальное N" in result.explanation


def test_peak_run_is_fast() -> None:
    started = time.perf_counter()
    run(record_events=True)
    assert time.perf_counter() - started < 3.0


# A tow train with four carts on the same route: the cycle model gives four times the AMR rate per robot.
TOW = replace(
    PALLETS,
    model=ProcessModel.TOW_TRAIN,
    product_name="Тягач",
    robots=4,
    units_per_trip=4,
    analytic_robots=4,
    analytic_per_robot_h=4 * PALLETS.analytic_per_robot_h,  # type: ignore[operator]
)


def test_tow_train_carries_several_pallets_per_trip_and_matches_its_cycle_model() -> None:
    result = run(TOW)
    summary = result.summary
    assert summary.sla["kind"] == "lead_time"
    assert summary.sla["achieved_pct"] >= 95
    trips = sum(r.tasks for r in result.record.robots)
    assert summary.completed > 2 * trips
    assert summary.vs_analytic is not None
    assert summary.vs_analytic.verdict == "confirmed"
    assert abs(summary.vs_analytic.delta_pct) < 15


def test_too_few_tow_trains_are_the_bottleneck() -> None:
    summary = run(TOW, fleet={"pallet_transport": 2}).summary
    assert summary.sla["achieved_pct"] < 95
    assert summary.bottleneck.resource_kind == "fleet"


def test_a_slow_filling_train_leaves_on_schedule() -> None:
    """At night a full train would take hours to fill; the departure norm keeps pallets in the lead time."""
    quiet = replace(TOW, inbound_per_day=100, outbound_per_day=100)
    summary = run(quiet, mode=SimMode.NORMAL).summary
    assert summary.completed_by_humans == 0
    assert summary.sla["p95_lead_time_min"] <= SETTINGS.tow_dispatch_wait_s / 60 + 10
