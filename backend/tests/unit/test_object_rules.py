import re
from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import Requirement
from app.engine.expressions import parse
from app.engine.matching import CandidateInput, CandidateStatus, SpecFact, evaluate
from app.engine.sizing import DemandInput, SizingOptions, size
from app.engine.trace import Book, InputKind, Quantity
from app.seeds.schemas import ObjectTypeSeed, load_norm_set, load_object_types

APP = Path(__file__).resolve().parents[2] / "app"
NORMS = Book.of(InputKind.NORM, [(n.key, n.name, n.value, n.unit) for n in load_norm_set().norms])
AIRSIDE = Requirement(
    key="airside_admission",
    spec="airside_certified",
    comparison="gte",
    required="airside_certification",
    unit=None,
    solution_types=[],
    message="Нет подтверждённого допуска к работе на перроне",
    why_needed="Нужен допуск",
    when="airside_certification",
)
RACKS = Requirement(
    key="racks_for_automated_storage",
    spec=None,
    comparison=None,
    required=None,
    unit=None,
    solution_types=[],
    message="Сейчас стеллажи не под автоматическое хранение",
    why_needed="Замена стеллажей не входит в цену каталога",
    kind="object",
    condition="storage_type",
    severity="warning",
)


def _candidate(**specs: float) -> CandidateInput:
    return CandidateInput(
        product_id=uuid4(),
        name="Тягач",
        solution_type="tow_tractor",
        stage="operation",
        trl=8,
        completeness=1.0,
        price_rub=1.0,
        cases_count=1,
        specs={k: SpecFact(v, ProvenanceStatus.CONFIRMED) for k, v in specs.items()},
        spec_names={},
    )


def test_a_rule_applies_only_when_its_condition_holds() -> None:
    required = evaluate(_candidate(), [AIRSIDE], {"airside_certification": 1.0}, include_rnd=False)
    assert required.status == CandidateStatus.CHECK
    assert any(r.spec_key == "airside_certified" for r in required.reasons)
    free = evaluate(_candidate(), [AIRSIDE], {"airside_certification": 0.0}, include_rnd=False)
    assert free.status == CandidateStatus.FIT
    assert not free.reasons
    admitted = evaluate(
        _candidate(airside_certified=1.0), [AIRSIDE], {"airside_certification": 1.0}, include_rnd=False
    )
    assert admitted.status == CandidateStatus.FIT


def test_an_object_rule_warns_about_the_object_not_the_robot() -> None:
    selective = evaluate(_candidate(), [RACKS], {"storage_type": 0.0}, include_rnd=False)
    assert selective.status == CandidateStatus.CHECK
    assert selective.reasons[0].code == "RACKS_FOR_AUTOMATED_STORAGE"
    shuttle = evaluate(_candidate(), [RACKS], {"storage_type": 1.0}, include_rnd=False)
    assert shuttle.status == CandidateStatus.FIT
    assert shuttle.checks_passed == 1


def _lift_cycle(floors: float) -> float:
    hospital = next(o for o in load_object_types() if o.key == "hospital")
    meals = next(p for p in hospital.processes if p.key == "meal_delivery")
    values = {**{k: q.value for k, q in NORMS.items.items()}, "floors": floors}
    seconds = parse(meals.cycle_extras[0].formula).evaluate(values)
    specs = Book.of(
        InputKind.SPEC, [("max_speed_mps", "Скорость", 1.0, "м/с"), ("runtime_h", "Работа", 10.0, "ч")]
    )
    outcome = size(
        meals.sizing_model,  # type: ignore[arg-type]
        DemandInput("meal_delivery", 100, 60, 1000, 16),
        specs,
        NORMS,
        SizingOptions(
            distance=Quantity("route_length_m", "Маршрут", 180, "м", InputKind.PARAM),
            extras=(Quantity("elevator_s", "Лифт", seconds, "с", InputKind.METRIC),),
        ),
    )
    assert outcome.cycle_time_s is not None
    return outcome.cycle_time_s


def test_the_lift_ride_grows_with_the_floors() -> None:
    """Nine floors give a 120 s ride each way; each extra floor adds half a ride up and back."""
    nine, eighteen = _lift_cycle(9), _lift_cycle(18)
    assert eighteen - nine == pytest.approx(2 * 9 * 0.5 * 10)


def _references(object_type: ObjectTypeSeed) -> str:
    """Everything that can read a parameter: the object's formulas, rules, costs, checks — and the code."""
    prose = {"name", "description", "demand_formula", "demand_params", "labor_allocation_note"}
    texts = [p.model_dump_json(exclude=prose) for p in object_type.processes]
    texts += [g.model_dump_json() for g in object_type.labor_groups]
    texts += [c.formula for c in object_type.site_costs] + [c.expression for c in object_type.checks]
    texts += [f.read_text(encoding="utf-8") for f in APP.rglob("*.py")]
    return "\n".join(texts)


@pytest.mark.parametrize("object_type", load_object_types(), ids=lambda o: o.key)
def test_every_required_parameter_drives_something(object_type: ObjectTypeSeed) -> None:
    """ТЗ 3.2.1 lists the fields; a required field that changes nothing misleads the user (audit 23.09)."""
    text = _references(object_type)
    silent = [
        p.key
        for p in object_type.parameters
        if p.required
        and p.key not in object_type.descriptive_params
        and not re.search(rf"\b{p.key}(_length|_width|_height)?\b", text)
    ]
    assert silent == []
    for key in object_type.descriptive_params:
        assert key in {p.key for p in object_type.parameters if p.required}, key
