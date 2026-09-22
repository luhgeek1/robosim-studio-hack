import pytest

from app.engine.sensitivity import (
    GROUP_NAMES,
    DriverKind,
    Group,
    apply,
    heatmap,
    monte_carlo,
    norm_driver,
    percent_driver,
    spearman,
    tornado,
)
from tests.unit.engine.test_calculation import scenario

INP = scenario()
PRICE = percent_driver(
    Group.EQUIPMENT_PRICE.value, GROUP_NAMES[Group.EQUIPMENT_PRICE], DriverKind.CATALOG, None, 1.0, -20, 20
)
LABOR = percent_driver(
    Group.LABOR_COST.value, GROUP_NAMES[Group.LABOR_COST], DriverKind.GROUP, None, 1.0, -20, 20
)
SPEED = norm_driver(INP.norms.get("effective_speed_factor"), 0.5, 0.75)


def test_groups_scale_their_members() -> None:
    cheaper = apply(INP, PRICE, 0.8)
    assert cheaper.items[0].price == pytest.approx(INP.items[0].price * 0.8)
    richer = apply(INP, LABOR, 1.2)
    assert richer.params["forklift_salary_rub_month"] == pytest.approx(120_000 * 1.2)
    faster = apply(INP, SPEED, 0.75)
    assert faster.norms.value("effective_speed_factor") == 0.75
    assert INP.norms.value("effective_speed_factor") == 0.6


def test_tornado_moves_metric_in_expected_direction_and_ranks() -> None:
    base, items = tornado(INP, [PRICE, LABOR, SPEED], "npv_rub")
    by_key = {item.driver.key: item for item in items}
    assert by_key["equipment_price"].metric_at_low > base > by_key["equipment_price"].metric_at_high
    assert by_key["labor_cost"].metric_at_high > base
    assert [item.rank for item in items] == [1, 2, 3]
    assert items[0].swing >= items[1].swing >= items[2].swing


def test_heatmap_grid_shape() -> None:
    grid = heatmap(INP, PRICE, LABOR, 3, "npv_rub")
    assert grid.x_values == pytest.approx([0.8, 1.0, 1.2])
    assert len(grid.z) == 3
    assert all(len(row) == 3 for row in grid.z)
    assert grid.z[0][0] > grid.z[0][2]


def test_monte_carlo_is_reproducible_with_seed() -> None:
    thresholds = {"a": 3.0, "b": 5.0}
    first = monte_carlo(INP, [PRICE, LABOR, SPEED], n=200, metric="npv_rub", seed=7, thresholds=thresholds)
    second = monte_carlo(INP, [PRICE, LABOR, SPEED], n=200, metric="npv_rub", seed=7, thresholds=thresholds)
    assert first.p50 == second.p50
    assert first.p10 <= first.p50 <= first.p90
    assert sum(first.counts) == first.n == 200
    assert set(first.probability) == {"payback_le_3y", "payback_le_5y", "npv_positive"}
    price = next(corr for driver, corr in first.top_drivers if driver.key == "equipment_price")
    assert price < 0


def test_spearman_detects_monotonic_relation() -> None:
    assert spearman([1, 2, 3, 4], [10, 20, 30, 45]) == pytest.approx(1.0)
    assert spearman([1, 2, 3, 4], [4, 3, 2, 1]) == pytest.approx(-1.0)
