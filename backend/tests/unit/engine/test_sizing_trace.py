from dataclasses import replace

import pytest

from app.domain.reference import SizingModel
from app.engine.calculation.context import Context
from app.engine.calculation.fleet import size_item
from app.engine.trace import Book, InputKind
from tests.unit.engine.test_calculation import scenario


@pytest.mark.parametrize(
    ("model", "capacity", "tare"),
    [
        (SizingModel.TOW_TRAIN, False, False),
        (SizingModel.TOW_TRAIN, True, True),
        (SizingModel.TRANSPORT_CYCLE, True, False),
        (SizingModel.STATION_THROUGHPUT, False, False),
    ],
)
def test_sizing_graph_preserves_demand_and_spec_sources(
    model: SizingModel, capacity: bool, tare: bool
) -> None:
    inp = scenario()
    process = inp.processes[0]
    process_demand = dict(process.demand or {})
    if capacity:
        process_demand["load_per_trip"] = "manual_pallets_per_trip"
    if tare:
        process_demand["trip_tare_kg"] = "baggage_cart_tare_kg"
    process = replace(process, demand=process_demand)
    item = replace(
        inp.items[0],
        sizing_model=model,
        specs=Book.of(
            InputKind.SPEC,
            [
                ("towing_capacity_kg", "Буксируемая масса", 3_000, "кг"),
                ("max_speed_mps", "Скорость", 4, "м/с"),
                ("throughput_units_h", "Пропускная способность", 100, "ед/ч"),
            ],
        ),
    )
    context = Context(replace(inp, processes=[process], items=[item]), render=True)
    result = size_item(context, item, process, context.demand(process))
    assert result is not None
    assert result.robots is not None
    seen: set[str] = set()
    for step in context.tr.steps:
        assert step.key not in seen
        assert step.formula
        for quantity in step.inputs:
            if quantity.kind == InputKind.METRIC:
                assert quantity.key in seen, (step.key, quantity.key)
        seen.add(step.key)
    weight = next(s for s in context.tr.steps if s.key == "pallet_transport.unit_weight_kg")
    assert weight.formula == "pallet_weight_kg"
    assert weight.inputs[0].kind == InputKind.PARAM
    if capacity:
        load = next(s for s in context.tr.steps if s.key == "pallet_transport.load_per_trip")
        assert load.inputs[0].key == "manual_pallets_per_trip"
        assert load.inputs[0].kind == InputKind.NORM
