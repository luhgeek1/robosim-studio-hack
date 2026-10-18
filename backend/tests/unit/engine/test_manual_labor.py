from dataclasses import replace

import pytest

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import ProcessDef
from app.domain.scenario.models import CountMode, CountSource
from app.engine.calculation import CalculationError, ParamMeta, calculate
from app.engine.calculation.context import Context
from app.engine.calculation.labor import release_cap
from app.engine.trace import Book, InputKind
from app.seeds.schemas import load_object_types
from tests.unit.engine.test_calculation import H1500, NORMS, PARAMS, scenario


def _norms(**changes: float) -> Book:
    return Book.of(
        InputKind.NORM,
        [(q.key, q.name, changes.get(q.key, q.value), q.unit) for q in NORMS.items.values()],
    )


def _manual_cap(object_type: str, key: str, params: dict[str, float]) -> tuple[float, float]:
    seed = next(o for o in load_object_types() if o.key == object_type)
    process_seed = next(p for p in seed.processes if p.key == key)
    process = ProcessDef(**{**process_seed.model_dump(exclude={"requirements"}), "requirements": []})
    context = Context(
        scenario(
            params={**params, "working_days_per_year": 365.0},
            param_meta={
                k: ParamMeta(k, None, ProvenanceStatus.USER) for k in [*params, "working_days_per_year"]
            },
            processes=[process],
        ),
        render=True,
    )
    cap = release_cap(context, process, context.demand(process), context.working_days())
    assert cap is not None
    hours = next(s.value for s in context.tr.steps if s.key == f"{key}.manual_workload_hours_year")
    return cap.value, hours


def test_robot_speed_and_payload_do_not_change_manual_workload_or_baseline() -> None:
    """400 pallets/day: human cycle = 2×200/1.5+60 seconds, regardless of robot speed/capacity."""
    params = {**PARAMS, "pallets_in_per_day": 200.0, "pallets_out_per_day": 200.0}
    slow = calculate(scenario(params=params))
    faster = Book.of(
        InputKind.SPEC,
        [(q.key, q.name, 3.0 if q.key == "max_speed_mps" else q.value, q.unit) for q in H1500.items.values()]
        + [("payload_kg", "Грузоподъёмность", 5_000.0, "кг")],
    )
    fast = calculate(scenario(params=params, items=[replace(scenario().items[0], specs=faster)]))
    for key in ("manual_rate", "manual_workload_hours_year", "release_cap_fte"):
        before = next(s.value for s in slow.trace if s.key == f"pallet_transport.{key}")
        after = next(s.value for s in fast.trace if s.key == f"pallet_transport.{key}")
        assert before == pytest.approx(after)
    assert slow.economics.baseline.total == fast.economics.baseline.total
    assert slow.economics.metrics.fte_released == pytest.approx(fast.economics.metrics.fte_released)
    assert slow.sizing[0].count.analytic > fast.sizing[0].count.analytic


def test_reassignment_releases_capacity_without_claiming_cash_savings() -> None:
    full = calculate(scenario()).economics.metrics
    result = calculate(scenario(norms=_norms(labor_cash_realization_share=0)))
    metrics = result.economics.metrics
    saving = next(s for s in result.trace if s.key == "labor_savings.pallet_transport")
    potential = next(s for s in result.trace if s.key == "labor_capacity_value.pallet_transport")
    hours = next(s for s in result.trace if s.key == "released_labor_hours.pallet_transport")
    assert saving.value == 0
    assert potential.value > 0
    assert hours.value > 0
    assert metrics.fte_released == pytest.approx(full.fte_released)
    assert metrics.effect_rub_year == pytest.approx(-metrics.opex_rub_year)
    assert result.economics.monthly[-1].savings == 0


def test_partial_coverage_scales_a_workload_limited_release() -> None:
    params = {**PARAMS, "pallets_in_per_day": 200.0, "pallets_out_per_day": 200.0}
    full = calculate(scenario(params=params))
    partial = calculate(
        scenario(
            params=params, items=[replace(scenario().items[0], count_mode=CountMode.MANUAL, count_manual=1)]
        )
    )
    assert partial.economics.metrics.fte_released == pytest.approx(
        full.economics.metrics.fte_released * partial.sizing[0].coverage
    )


@pytest.mark.parametrize(
    ("object_type", "key", "params", "hours_day"),
    [
        ("warehouse", "high_bay_storage", PARAMS, 2_000 * 60 / 3_600),
        (
            "warehouse",
            "order_picking",
            {
                "order_lines_per_day": 1_000,
                "picker_productivity_lines_per_hour": 100,
                "shifts_per_day": 2,
                "shift_hours": 8,
                "peak_factor": 1.5,
            },
            10,
        ),
        (
            "warehouse",
            "floor_cleaning",
            {"area_m2": 1_000, "shifts_per_day": 2, "shift_hours": 8, "scheduled_peak_factor": 1},
            1_000 * 2 / 200,
        ),
        (
            "airport",
            "baggage_handling",
            {
                "baggage_per_day": 1_200,
                "baggage_route_length_m": 600,
                "bags_per_cart": 20,
                "flights_per_day": 100,
                "flights_peak_hour": 10,
                "operating_hours_per_day": 24,
            },
            1_200 / (3 * 20) * (2 * 600 / 3 + 60) / 3_600,
        ),
        (
            "hospital",
            "meal_delivery",
            {
                "beds": 100,
                "bed_occupancy_pct": 1,
                "feedings_per_day": 3,
                "meal_points": 10,
                "kitchen_to_ward_distance_m": 180,
                "floors": 9,
                "elevator_cycle_min": 2,
                "operating_hours_per_day": 24,
            },
            3 * 10 * (2 * 180 + 60 + 2 * 120) / 3_600,
        ),
        (
            "hospital",
            "linen_transport",
            {
                "linen_dirty_kg_per_day": 300,
                "linen_clean_kg_per_day": 300,
                "linen_points": 1,
                "linen_container_weight_kg": 100,
                "kitchen_to_ward_distance_m": 180,
                "floors": 9,
                "elevator_cycle_min": 2,
                "operating_hours_per_day": 24,
            },
            600 / 100 * (2 * 180 + 60 + 2 * 120) / 3_600,
        ),
    ],
)
def test_manual_workload_uses_process_demand_units(
    object_type: str, key: str, params: dict[str, float], hours_day: float
) -> None:
    cap, hours = _manual_cap(object_type, key, params)
    assert hours == pytest.approx(hours_day * 365)
    assert cap == pytest.approx(hours / (24 * 365 / 4.2) * 1.25)


def test_horizontal_transport_and_vertical_storage_do_not_duplicate_work() -> None:
    horizontal, _ = _manual_cap("warehouse", "pallet_transport", PARAMS)
    vertical, _ = _manual_cap("warehouse", "high_bay_storage", PARAMS)
    expected_hours = 2_000 * (2 * 200 / 1.5 + 60 + 60) / 3_600 * 365
    assert horizontal + vertical == pytest.approx(expected_hours / (24 * 365 / 4.2) * 1.25)
    warehouse = next(o for o in load_object_types() if o.key == "warehouse")
    assert sum(p.labor_allocation.get("forklift_operators", 0) for p in warehouse.processes) == 1


def test_unconfigured_manual_rate_does_not_fall_back_to_robot_speed() -> None:
    inp = scenario()
    process = inp.processes[0]
    assert process.demand is not None
    process = replace(process, demand={k: v for k, v in process.demand.items() if k != "manual_rate"})
    with pytest.raises(CalculationError, match="независимая выработка"):
        calculate(replace(inp, processes=[process]))


def test_changed_analytic_fleet_does_not_rescale_old_simulation() -> None:
    inp = scenario()
    result = calculate(replace(inp, items=[replace(inp.items[0], simulated_robots=8, simulated_basis=14)]))
    assert result.sizing[0].count.source == CountSource.ANALYTIC
    assert result.sizing[0].count.simulated is None
    assert all(s.key != "pallet_transport.simulated_robots" for s in result.trace)
