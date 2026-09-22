import time
from dataclasses import replace

import pytest

from app.domain.layout.models import EdgeKind, LayoutTemplate, NodeKind, RouteKey, ZoneKind
from app.engine.layout import Generated, LayoutError, generate, stats, validate
from app.engine.trace import Book, InputKind
from app.seeds.schemas import load_norm_set

NORMS = Book.of(InputKind.NORM, [(n.key, n.name, n.value, n.unit) for n in load_norm_set().norms])
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
    "order_lines_per_day": 100_000.0,
}


def params(**changes: float | None) -> Book:
    values = {**DEMO, **changes}
    return Book.of(InputKind.PARAM, [(k, k, v, None) for k, v in values.items()])


def build(
    template: LayoutTemplate = LayoutTemplate.WAREHOUSE_U_FLOW,
    overrides: dict[str, float] | None = None,
    **changes: float | None,
) -> Generated:
    return generate(template, params(**changes), NORMS, overrides)


def step(generated: Generated, key: str) -> float:
    return next(s.value for s in generated.derivation if s.key == key)


def test_demo_warehouse_geometry_is_derived_from_params_and_norms() -> None:
    generated = build()
    assert step(generated, "building_width_m") == pytest.approx(200.0)
    assert step(generated, "building_depth_m") == pytest.approx(100.0)
    # (10 − 0.5) / 1.9 = 5 levels; 26 bays per face; 2 × 26 × 3 × 5 = 780 pallets per aisle.
    assert step(generated, "rack_levels") == 5
    assert step(generated, "slots_per_aisle") == 780
    assert step(generated, "aisles_needed") == 26
    assert step(generated, "docks_in") == 3
    assert step(generated, "pick_stations") == 23
    assert all(s.rendered for s in generated.derivation)


def test_capacity_shortfall_is_reported_not_hidden() -> None:
    generated = build()
    summary = stats(generated.plan)
    assert summary.rack_slots_total == 19_500
    assert any("19 500 из 20 000" in w for w in generated.warnings)


def test_routes_come_from_the_graph_and_are_plausible() -> None:
    summary = stats(build().plan)
    routes = summary.routes
    assert set(routes) == set(RouteKey)
    assert 60 < routes[RouteKey.DOCK_IN_TO_STORAGE].value_m < 130
    assert 60 < routes[RouteKey.STORAGE_TO_DOCK_OUT].value_m < 130
    # The FCBAS default of 200 m overstates the route in a 20 000 m² building with docks along the long side.
    assert routes[RouteKey.DOCK_IN_TO_STORAGE].value_m < NORMS.value("transport_default_one_way_distance_m")
    assert 20 < routes[RouteKey.POD_TO_STATION].value_m < 60
    assert summary.min_aisle_width_m == pytest.approx(2.8)
    assert (summary.docks_in, summary.docks_out, summary.pick_stations, summary.chargers) == (3, 3, 23, 8)
    assert summary.pods > 0


def test_generated_plan_is_valid_and_connected() -> None:
    for template in LayoutTemplate:
        plan = build(template).plan
        assert validate(plan) == []
        kinds = {node.kind for node in plan.nodes}
        assert {NodeKind.DOCK_IN, NodeKind.DOCK_OUT, NodeKind.RACK_FACE, NodeKind.CHARGER} <= kinds
        assert {zone.kind for zone in plan.zones} >= {ZoneKind.RECEIVING, ZoneKind.SHIPPING, ZoneKind.STORAGE}


def test_flow_through_puts_shipping_docks_on_the_opposite_wall() -> None:
    plan = build(LayoutTemplate.WAREHOUSE_FLOW_THROUGH).plan
    docks_in = [n.y for n in plan.nodes if n.kind == NodeKind.DOCK_IN]
    docks_out = [n.y for n in plan.nodes if n.kind == NodeKind.DOCK_OUT]
    assert min(docks_in) > plan.height_m / 2 > max(docks_out)


def test_main_aisles_are_two_way_and_rack_aisles_one_way() -> None:
    plan = build().plan
    main = next(e for e in plan.edges if e.kind == EdgeKind.MAIN_AISLE)
    rack = next(e for e in plan.edges if e.kind == EdgeKind.RACK_AISLE)
    assert main.capacity >= 2
    # 2.8 m < 2 × 1.2 + 0.5: two loaded robots cannot pass each other in a rack aisle.
    assert rack.capacity == 1


def test_overrides_and_dock_doors_param_change_the_plan() -> None:
    assert stats(build(overrides={"docks_in": 6, "chargers": 4}).plan).docks_in == 6
    assert stats(build(overrides={"chargers": 4}).plan).chargers == 4
    split = stats(build(dock_doors=12, pallets_in_per_day=600, pallets_out_per_day=1800).plan)
    assert (split.docks_in, split.docks_out) == (3, 9)


def test_no_order_lines_means_no_goods_to_person_zone() -> None:
    generated = build(order_lines_per_day=None)
    summary = stats(generated.plan)
    assert summary.pick_stations == 0
    assert RouteKey.POD_TO_STATION not in summary.routes
    assert ZoneKind.PICKING not in {z.kind for z in generated.plan.zones}


def test_missing_params_and_unknown_overrides_are_rejected() -> None:
    with pytest.raises(LayoutError) as missing:
        build(pallet_positions=None, ceiling_height_m=None)
    assert {d["field"] for d in missing.value.details} == {
        "params.pallet_positions",
        "params.ceiling_height_m",
    }
    with pytest.raises(LayoutError, match="Неизвестные"):
        build(overrides={"robots": 3})


@pytest.mark.parametrize(
    ("changes", "message"),
    [({"ceiling_height_m": 2.0}, "Потолок"), ({"area_m2": 1200.0}, "неглубокое")],
)
def test_impossible_buildings_are_explained(changes: dict[str, float], message: str) -> None:
    with pytest.raises(LayoutError, match=message):
        build(**changes)


def test_validate_finds_dangling_edges_and_unreachable_nodes() -> None:
    plan = build(order_lines_per_day=None).plan
    dock = next(n for n in plan.nodes if n.kind == NodeKind.DOCK_IN)
    broken = replace(plan, edges=(*plan.edges, replace(plan.edges[0], id="bad", target="missing")))
    assert any(p["field"] == "edges.bad" for p in validate(broken))
    isolated = replace(plan, edges=tuple(e for e in plan.edges if dock.id not in (e.source, e.target)))
    assert validate(isolated)


def test_generation_is_fast_enough_for_interactive_use() -> None:
    started = time.perf_counter()
    stats(build(area_m2=60_000.0, pallet_positions=60_000.0).plan)
    assert time.perf_counter() - started < 2.0
