import pytest

from app.engine.demand import (
    DemandFormula,
    LaborGroupInput,
    ProcessInput,
    labor_cost_rub_year,
    process_demand,
    total_labor_cost,
)

WAREHOUSE = {
    "pallets_in_per_day": 1000.0,
    "pallets_out_per_day": 1000.0,
    "pallets_internal_per_day": 0.0,
    "shifts_per_day": 2.0,
    "shift_hours": 11.0,
    "peak_factor": 1.5,
}
PALLETS = ProcessInput(
    key="pallet_transport",
    name="Перемещение паллет",
    demand=DemandFormula(
        per_day="pallets_in_per_day + pallets_out_per_day + pallets_internal_per_day",
        hours_per_day="shifts_per_day * shift_hours",
        peak_factor="peak_factor",
    ),
    labor_allocation={"forklift_operators": 1.0},
)
GROUPS = {
    "forklift_operators": LaborGroupInput("forklift_operators", "Операторы погрузчиков", 25, 120_000),
    "pickers": LaborGroupInput("pickers", "Отборщики", 100, 100_000),
}


def test_labor_cost_matches_docs_data() -> None:
    # docs/DATA.md: forklift operators 25 × 120 000 × 12 × 1.302 = 46.872 mln ₽/year
    assert labor_cost_rub_year(25, 120_000, 1.302) == pytest.approx(46_872_000)


def test_pallet_peak_matches_hand_calculation() -> None:
    # docs/DATA.md: 2000 moves / 22 h × 1.5 = 136.4 pallets/h at peak
    total = total_labor_cost(list(GROUPS.values()), 1.302)
    result = process_demand(PALLETS, WAREHOUSE, GROUPS, 1.302, total)
    assert result.demand_per_day == 2000
    assert result.avg_per_hour == pytest.approx(90.909, rel=1e-4)
    assert result.peak_per_hour == pytest.approx(136.36, rel=1e-4)
    assert result.cost_rub_year == pytest.approx(46_872_000)
    # 46.9 of 203.1 mln total (pickers 156.2 + forklift 46.9)
    assert result.share_of_labor_cost == pytest.approx(46.872 / (156.24 + 46.872), rel=1e-4)
    assert result.missing == []


def test_allocation_share_splits_shared_staff() -> None:
    half = ProcessInput(PALLETS.key, PALLETS.name, PALLETS.demand, {"forklift_operators": 0.5})
    result = process_demand(half, WAREHOUSE, GROUPS, 1.302, 1.0)
    assert result.fte == 12.5
    assert result.cost_rub_year == pytest.approx(46_872_000 / 2)


def test_missing_inputs_are_named() -> None:
    values = {**WAREHOUSE, "pallets_out_per_day": None}
    result = process_demand(PALLETS, values, GROUPS, 1.302, 1.0)
    assert result.demand_per_day is None
    assert result.peak_per_hour is None
    assert "pallets_out_per_day" in result.missing
