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
from app.engine.simulation.model import Model
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
    # Every replication has to hold the target, not only their mean (D-029).
    assert points[result.recommended_count].sla_min_pct >= result.target_pct
    assert all(p.passed == (p.sla_min_pct >= result.target_pct) for p in result.points)
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


def test_fleet_starts_mid_day_with_a_share_on_chargers() -> None:
    """Charge / (work + charge) of the fleet is on the chargers at the start, as mid-day (D-029)."""
    plan, prepared = layout()
    process = replace(PALLETS, robot=replace(PALLETS.robot, runtime_h=6.0, charge_min=120.0), robots=10)
    inp = SimInput(plan, (process,), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=1))
    model = Model(inp, prepared.pallet_net, prepared.full_net, prepared.segments)
    # Work 6 h × 0.8 and charge 2 h × 0.8 of battery: a quarter of the cycle is charging — 2 of 10 robots.
    assert sum(r.charging_at_start for r in model.robots) == 2
    assert all(SETTINGS.charge_threshold <= r.battery <= 1 for r in model.robots)
    result = simulate(inp, prepared)
    assert sum(r.charges for r in result.record.robots) >= 2


def _hospital() -> tuple[Plan, Prepared]:
    values = {
        "floors": 9.0,
        "elevators": 1.0,
        "corridor_width_m": 2.4,
        "kitchen_to_ward_distance_m": 180.0,
        "meal_points": 18.0,
    }
    plan = generate(
        LayoutTemplate.HOSPITAL_FLOOR,
        Book.of(InputKind.PARAM, [(k, k, v, None) for k, v in values.items()]),
        NORMS,
    ).plan
    return plan, prepare(plan, SETTINGS.two_way_width_m)


MEALS = SimProcess(
    key="meal_delivery",
    name="Доставка питания",
    model=ProcessModel.TRANSPORT,
    product_name="Курьер",
    robots=3,
    robot=RobotSpec(speed_mps=0.72, load_s=30, unload_s=30),
    hours_per_day=24,
    peak_factor=2,
    lead_time_s=20 * 60,
    target_share=0.95,
    internal_per_day=54,
    units_per_trip=30,
    analytic_robots=3,
    analytic_per_robot_h=100,
    sources=("kitchen",),
    destinations=("ward",),
    ride_s=120,
)


def test_hospital_trips_ride_the_lift_and_carry_the_load_per_trip() -> None:
    plan, prepared = _hospital()
    result = simulate(SimInput(plan, (MEALS,), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3)), prepared)
    lifts = {n.id for n in plan.nodes if n.kind == NodeKind.ELEVATOR}
    assert any(set(e.path) & lifts for e in result.record.events if e.type == "move")
    comparison = result.summary.vs_analytic
    assert comparison is not None
    # A trip carries 30 portions: the simulated rate is in portions, like the cycle model's.
    assert comparison.sim_throughput_per_hour == pytest.approx(
        comparison.analytic_throughput_per_hour, rel=0.25
    )


def test_one_lift_for_a_busy_flow_is_the_bottleneck() -> None:
    plan, prepared = _hospital()
    busy = replace(MEALS, robots=12, internal_per_day=700, ride_s=240)
    result = simulate(SimInput(plan, (busy,), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3)), prepared)
    assert result.summary.bottleneck.resource_kind == "elevator"
    assert any(e.reason == "elevator_busy" for e in result.record.events if e.type == "wait")


def test_airport_baggage_trains_run_from_sorting_to_the_stands() -> None:
    values = {
        "gates": 20.0,
        "terminals": 2.0,
        "baggage_carousels": 8.0,
        "baggage_route_length_m": 300.0,
    }
    plan = generate(
        LayoutTemplate.AIRPORT_APRON,
        Book.of(InputKind.PARAM, [(k, k, v, None) for k, v in values.items()]),
        NORMS,
    ).plan
    bags = SimProcess(
        key="baggage_handling",
        name="Багаж",
        model=ProcessModel.TOW_TRAIN,
        product_name="Тягач",
        robots=8,
        robot=RobotSpec(speed_mps=2.0, load_s=30, unload_s=30),
        hours_per_day=24,
        peak_factor=2,
        lead_time_s=45 * 60,
        target_share=0.95,
        internal_per_day=35_000,
        units_per_trip=120,
        analytic_robots=8,
        analytic_per_robot_h=400,
        sources=("buffer",),
        destinations=("apron",),
    )
    result = simulate(
        SimInput(plan, (bags,), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3)),
        prepare(plan, SETTINGS.two_way_width_m),
    )
    stands = {n.id for n in plan.nodes if n.kind == NodeKind.DROPOFF}
    assert any(e.node in stands for e in result.record.events if e.type == "unload")
    assert result.summary.vs_analytic is not None
