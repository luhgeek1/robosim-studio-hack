from dataclasses import replace

import pytest

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import SizingModel
from app.domain.scenario.models import CountMode, CountSource
from app.engine.calculation import CalculationInput, ParamMeta, calculate
from app.engine.trace import Book, InputKind
from tests.unit.engine.test_calculation import H1500, PARAMS, _process, scenario


def _picking(stations: int | None = None, rate: float | None = None) -> CalculationInput:
    params = {
        **PARAMS,
        "order_lines_per_day": 10_000.0,
        "picker_productivity_lines_per_hour": 100.0,
        "pickers": 40.0,
        "picker_salary_rub_month": 100_000.0,
        "pieces_per_day": 10_000.0,
        "item_weight_kg": 1.0,
    }
    specs = H1500
    if rate is not None:
        specs = Book(
            InputKind.SPEC,
            {
                **H1500.items,
                **Book.of(
                    InputKind.SPEC, [("station_throughput_lines_h", "Ставка станции", rate, "строк/ч")]
                ).items,
            },
        )
    item = replace(
        scenario().items[0],
        process_key="order_picking",
        solution_type="goods_to_person",
        sizing_model=SizingModel.GOODS_TO_PERSON,
        stations_manual=stations,
        specs=specs,
    )
    return scenario(
        params=params,
        param_meta={k: ParamMeta(k, None, ProvenanceStatus.USER) for k in params},
        processes=[_process("order_picking")],
        items=[item],
    )


@pytest.mark.parametrize("stations", [0, 1, 2, 3, 6])
def test_manual_station_count_caps_coverage_and_labor_benefits(stations: int) -> None:
    full = calculate(_picking())
    result = calculate(_picking(stations))
    sizing = result.sizing[0]
    # 300 lines/h × 85% planned utilization is the same rate used to size the station count.
    share = min(1.0, stations * 300 * 0.85 / sizing.demand_peak_per_hour)
    assert sizing.stations == stations
    assert sizing.count.analytic == full.sizing[0].count.analytic
    assert sizing.coverage == pytest.approx(share)
    assert sizing.fleet_per_hour <= stations * 300 * 0.85
    assert result.economics.baseline.total == full.economics.baseline.total
    for key in (
        "fte_released",
        "labor_savings_rub_year",
        "labor_potential_savings_rub_year",
        "labor_hours_released_year",
    ):
        assert getattr(result.economics.metrics, key) == pytest.approx(
            getattr(full.economics.metrics, key) * share
        )
    assert any("станций отбора ниже" in warning for warning in sizing.warnings) == (share < 1)
    trace = {step.key: step for step in result.trace}
    assert trace["order_picking.stations_final"].value == stations
    assert trace["order_picking.stations_final"].inputs[0].kind == InputKind.PARAM
    if stations:
        assert trace["stations_total"].value == stations
        assert trace["stations_total"].inputs[0].key == "order_picking.stations_final"
        assert trace["capex_stations"].value == stations * _picking().norms.value("g2p_station_rub")
    else:
        assert "capex_stations" not in trace
    seen: set[str] = set()
    for step in result.trace:
        assert step.key not in seen
        for quantity in step.inputs:
            if quantity.kind == InputKind.METRIC:
                assert quantity.key in seen, (step.key, quantity.key)
        seen.add(step.key)


def test_product_station_rate_is_used_and_robot_shortage_still_limits_output() -> None:
    inp = _picking(1, rate=200)
    result = calculate(inp)
    limit = next(step for step in result.trace if step.key == "order_picking.station_capacity_per_hour")
    assert limit.value == pytest.approx(200 * 0.85)
    assert any(q.key == "station_throughput_lines_h" and q.kind == InputKind.SPEC for q in limit.inputs)
    enough_stations = _picking(6)
    short = calculate(
        replace(
            enough_stations,
            items=[replace(enough_stations.items[0], count_mode=CountMode.MANUAL, count_manual=1)],
        )
    )
    sizing = short.sizing[0]
    assert sizing.outcome is not None
    assert sizing.coverage == pytest.approx(sizing.outcome.effective_per_hour / sizing.demand_peak_per_hour)


def test_verified_simulation_may_use_planning_headroom_but_not_zero_stations() -> None:
    inp = _picking(1)
    inp = replace(inp, params={**inp.params, "order_lines_per_day": 280 * 22 / 1.5})
    analytic = calculate(inp)
    assert analytic.sizing[0].coverage == pytest.approx(255 / 280)
    confirmed = replace(
        inp.items[0],
        simulated_robots=analytic.sizing[0].count.analytic,
        simulated_basis=analytic.sizing[0].count.analytic,
    )
    simulated = calculate(replace(inp, items=[confirmed]))
    assert simulated.sizing[0].count.source == CountSource.SIMULATED
    assert simulated.sizing[0].coverage == 1
    impossible = calculate(replace(inp, items=[replace(confirmed, stations_manual=0)]))
    assert impossible.sizing[0].count.source == CountSource.ANALYTIC
    assert impossible.sizing[0].coverage == 0
    assert impossible.economics.metrics.labor_savings_rub_year == 0


def test_simulation_evidence_never_overrides_hard_station_throughput() -> None:
    inp = _picking(1)
    analytic = calculate(inp)
    count = analytic.sizing[0].count.analytic
    result = calculate(
        replace(inp, items=[replace(inp.items[0], simulated_robots=count, simulated_basis=count)])
    )
    assert result.sizing[0].count.source == CountSource.SIMULATED
    assert result.sizing[0].coverage == pytest.approx(300 / result.sizing[0].demand_peak_per_hour)
    assert result.sizing[0].fleet_per_hour == 300
