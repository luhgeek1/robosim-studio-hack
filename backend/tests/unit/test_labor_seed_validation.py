import pytest

from app.seeds.reference import _formula_problems
from app.seeds.schemas import ObjectTypeSeed, load_norm_set, load_object_types


@pytest.mark.parametrize("object_type", load_object_types(), ids=lambda item: item.key)
def test_manual_workload_formulas_accept_only_registered_layout_routes(object_type: ObjectTypeSeed) -> None:
    norms = {norm.key for norm in load_norm_set().norms}
    assert _formula_problems(object_type, norms) == []
    process = next(p for p in object_type.processes if p.labor_allocation)
    assert process.demand is not None
    changed = process.model_copy(
        update={"demand": process.demand.model_copy(update={"manual_rate": "layout_route_misspelled_m"})}
    )
    invalid = object_type.model_copy(update={"processes": [changed]})
    problems = _formula_problems(invalid, norms)
    assert any("manual_rate: unknown names ['layout_route_misspelled_m']" in issue for issue in problems)
