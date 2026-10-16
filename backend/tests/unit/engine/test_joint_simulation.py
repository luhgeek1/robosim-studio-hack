from dataclasses import replace

import pytest

from app.engine.simulation import SimConfig, SimInput, SimMode, SimulationError, simulate
from app.engine.simulation.joint import joint_sweep, validate_fleet
from app.engine.simulation.model import Model
from app.engine.simulation.sweep import Sweep
from tests.unit.engine.test_simulation import MEALS, PALLETS, PICKING, SETTINGS, _hospital, layout


def test_separately_feasible_hospital_processes_fail_at_the_shared_lift() -> None:
    plan, prepared = _hospital()
    meals = replace(MEALS, internal_per_day=60)
    linen = replace(meals, key="linen_delivery", name="Бельё", sources=("laundry",))
    inp = SimInput(plan, (meals, linen), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3))
    for process in inp.processes:
        isolated = Sweep(inp, process.key, 3, prepared).run()
        assert isolated.recommended_count is not None
    joint = joint_sweep(inp, meals.key, 3, prepared)
    assert joint.candidate_count is not None
    assert joint.result.recommended_count is None
    assert joint.validation.status == "failed"
    assert any(not process.passed for process in joint.validation.processes)
    assert "Результат не применён" in joint.result.explanation


def test_warehouse_shared_charger_is_a_joint_constraint() -> None:
    plan, prepared = layout()
    robot = replace(PALLETS.robot, runtime_h=1.0, charge_min=30)
    first = replace(PALLETS, inbound_per_day=250, outbound_per_day=250, robots=10, robot=robot)
    second = replace(first, key="other_pallets")
    settings = replace(SETTINGS, robots_per_charger=None)
    config = SimConfig(mode=SimMode.PEAK, seed=3, chargers=1)
    for process in (first, second):
        check = validate_fleet(SimInput(plan, (process,), settings, config), {process.key: 10}, 2, prepared)
        assert check.status == "passed"
    inp = SimInput(plan, (first, second), settings, config)
    fleet = {first.key: 10, second.key: 10}
    assert validate_fleet(inp, fleet, 2, prepared).status == "failed"
    more_chargers = replace(inp, config=replace(config, chargers=10))
    assert validate_fleet(more_chargers, fleet, 2, prepared).status == "passed"


def test_charger_capacity_equals_the_paid_quantity() -> None:
    plan, prepared = layout()
    for count in (1, 3, 20):
        inp = SimInput(plan, (PALLETS,), SETTINGS, SimConfig(chargers=count))
        model = Model(inp, prepared.pallet_net, prepared.full_net, prepared.segments)
        assert sum(charger.resource.capacity for charger in model.chargers.values()) == count


def test_joint_search_repairs_other_processes_incapable_starting_fleet() -> None:
    plan, prepared = _hospital()
    meals = replace(MEALS, internal_per_day=12, robots=1, analytic_robots=1)
    linen = replace(
        meals,
        key="linen_delivery",
        name="Бельё",
        sources=("laundry",),
        robot=replace(meals.robot, speed_mps=0.3),
    )
    inp = SimInput(plan, (meals, linen), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3))
    joint = joint_sweep(inp, meals.key, 2, prepared)
    assert joint.validation.status == "passed"
    assert joint.validation.fleet[linen.key] > linen.robots
    assert set(joint.validation.fleet) == {meals.key, linen.key}


def test_empty_observation_window_cannot_confirm_sla() -> None:
    plan, prepared = _hospital()
    process = replace(MEALS, internal_per_day=0)
    inp = SimInput(plan, (process,), SETTINGS, SimConfig(mode=SimMode.PEAK))
    validation = validate_fleet(inp, {process.key: 3}, 2, prepared)
    assert validation.status == "failed"
    assert validation.processes[0].sla_min_pct is None


def test_manual_fleet_of_another_process_remains_a_fixed_constraint() -> None:
    plan, prepared = _hospital()
    meals = replace(MEALS, internal_per_day=12)
    linen = replace(meals, key="linen_delivery", sources=("laundry",))
    inp = SimInput(plan, (meals, linen), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3))
    joint = joint_sweep(inp, meals.key, 2, prepared, fixed_fleet={linen.key: 8})
    assert joint.validation.status == "passed"
    assert joint.validation.fleet[linen.key] == 8
    assert joint.fixed_fleet == {linen.key}


def test_legacy_custom_mode_cannot_confirm_a_fleet_without_peak_validation() -> None:
    plan, prepared = layout()
    peak = SimInput(plan, (PALLETS,), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3))
    custom = replace(peak, config=replace(peak.config, mode=SimMode.CUSTOM))
    normal = replace(peak, config=replace(peak.config, mode=SimMode.NORMAL))
    expected = joint_sweep(peak, PALLETS.key, 2, prepared)
    assert joint_sweep(custom, PALLETS.key, 2, prepared) == expected
    assert joint_sweep(normal, PALLETS.key, 2, prepared) == expected


@pytest.mark.parametrize("override", [False, True])
def test_zero_pick_stations_cannot_become_all_available_stations(override: bool) -> None:
    plan, prepared = layout()
    process = PICKING if override else replace(PICKING, stations=0)
    config = SimConfig(mode=SimMode.PEAK, stations={process.key: 0} if override else {})
    inp = SimInput(plan, (process,), SETTINGS, config)
    with pytest.raises(SimulationError, match="задано 0 станций отбора"):
        simulate(inp, prepared)
    with pytest.raises(SimulationError, match="задано 0 станций отбора"):
        joint_sweep(inp, process.key, 2, prepared)


def test_process_station_limits_use_subsets_of_the_same_shared_resources() -> None:
    plan, prepared = layout()
    first = replace(PICKING, stations=1, lines_per_day=1000, robots=5)
    second = replace(first, key="other_picking", stations=3)
    inp = SimInput(plan, (first, second), SETTINGS, SimConfig(mode=SimMode.PEAK, seed=3))
    model = Model(inp, prepared.pallet_net, prepared.full_net, prepared.segments)
    one, three = model.process_stations(first.key), model.process_stations(second.key)
    assert len(one) == 1
    assert len(three) == 3
    assert one[0] is three[0]
    assert len(model.stations) == 3
    allowed = {first.key: {station.id for station in one}, second.key: {station.id for station in three}}
    result = simulate(inp, prepared)
    visits = [event for event in result.record.events if event.type == "station_busy"]
    assert {event.process_key for event in visits} == {first.key, second.key}
    for event in visits:
        assert event.node in allowed[event.process_key]
