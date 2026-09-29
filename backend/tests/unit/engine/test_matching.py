from dataclasses import replace
from uuid import uuid4

import pytest

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import Requirement
from app.engine.matching import (
    CandidateInput,
    CandidateStatus,
    QuickEstimate,
    SpecFact,
    _economics,
    evaluate,
    rank,
)

PAYLOAD = Requirement(
    key="payload_vs_pallet",
    spec="payload_kg",
    comparison="gte",
    required="pallet_weight_kg",
    unit="кг",
    solution_types=[],
    message="Грузоподъёмность меньше массы паллеты",
    why_needed="Нужна, чтобы проверить паллету до {required} кг",
)
WIDTH = Requirement(
    key="width_in_aisle",
    spec="width_mm",
    comparison="lte",
    required="m_to_mm(aisle_width_m) - aisle_safety_clearance_mm",
    unit="мм",
    solution_types=["amr_transport"],
    message="Робот не проходит в рабочий проход",
    why_needed="Нужна ширина робота",
)
VALUES = {"pallet_weight_kg": 800.0, "aisle_width_m": 2.8, "aisle_safety_clearance_mm": 500.0}
WEIGHTS = {
    "performance": 0.25,
    "cost_efficiency": 0.25,
    "infrastructure_fit": 0.15,
    "maturity": 0.15,
    "data_quality": 0.1,
    "references": 0.1,
}


def product(
    name: str,
    *,
    robots: int | None = 10,
    capex: float | None = 30e6,
    stage: str = "operation",
    **specs: float,
) -> CandidateInput:
    return CandidateInput(
        product_id=uuid4(),
        name=name,
        solution_type="amr_transport",
        stage=stage,
        trl=9,
        completeness=0.8,
        price_rub=2_700_000,
        cases_count=1,
        specs={k: SpecFact(v, ProvenanceStatus.CONFIRMED) for k, v in specs.items()},
        spec_names={"payload_kg": "Грузоподъёмность", "width_mm": "Ширина"},
        robots_estimate=robots,
        capex_estimate_rub=capex,
    )


def test_fit_when_all_checks_pass() -> None:
    result = evaluate(
        product("H1500", payload_kg=1500, width_mm=654), [PAYLOAD, WIDTH], VALUES, include_rnd=False
    )
    assert result.status == CandidateStatus.FIT
    assert result.checks_passed == 2
    assert any(r.code == "PAYLOAD_VS_PALLET_OK" for r in result.reasons)


def test_confirmed_mismatch_excludes_with_numbers() -> None:
    result = evaluate(product("AMR 100", payload_kg=100, width_mm=500), [PAYLOAD], VALUES, include_rnd=False)
    assert result.status == CandidateStatus.EXCLUDED
    blocking = next(r for r in result.reasons if r.severity == "blocking")
    assert blocking.required == 800
    assert blocking.actual == 100
    assert "100 кг, нужно ≥ 800 кг" in blocking.text


def test_missing_spec_means_check() -> None:
    result = evaluate(product("Нет данных", payload_kg=1500), [PAYLOAD, WIDTH], VALUES, include_rnd=False)
    assert result.status == CandidateStatus.CHECK
    assert result.missing_data[0].spec_key == "width_mm"


def test_assumed_spec_is_not_evidence() -> None:
    candidate = product("Допущение", width_mm=600)
    assumed = replace(candidate, specs={"payload_kg": SpecFact(1500, ProvenanceStatus.ASSUMPTION)})
    result = evaluate(assumed, [PAYLOAD], VALUES, include_rnd=False)
    assert result.status == CandidateStatus.CHECK


def test_missing_object_param_skips_check() -> None:
    result = evaluate(product("H1500", payload_kg=1500), [PAYLOAD], {}, include_rnd=False)
    assert result.status == CandidateStatus.FIT
    assert result.reasons[0].code == "OBJECT_PARAM_MISSING"


def test_rnd_excluded_unless_requested() -> None:
    rnd = product("Прототип", payload_kg=1500, width_mm=600, stage="rnd")
    assert evaluate(rnd, [PAYLOAD], VALUES, include_rnd=False).status == CandidateStatus.EXCLUDED
    assert evaluate(rnd, [PAYLOAD], VALUES, include_rnd=True).status == CandidateStatus.CHECK


def test_ranking_is_explainable() -> None:
    cheap = evaluate(
        product("Дешёвый", robots=10, capex=20e6, payload_kg=1500, width_mm=600),
        [PAYLOAD],
        VALUES,
        include_rnd=False,
    )
    costly = evaluate(
        product("Дорогой", robots=10, capex=40e6, payload_kg=1500, width_mm=600),
        [PAYLOAD],
        VALUES,
        include_rnd=False,
    )
    excluded = evaluate(product("Слабый", payload_kg=100), [PAYLOAD], VALUES, include_rnd=False)
    ordered = rank([costly, excluded, cheap], WEIGHTS)
    assert [r.candidate.name for r in ordered] == ["Дешёвый", "Дорогой", "Слабый"]
    assert ordered[0].rank == 1
    assert ordered[2].score is None
    cost = next(c for c in ordered[1].breakdown if c.criterion == "cost_efficiency")
    assert cost.points == pytest.approx(50)
    assert sum(c.weight for c in ordered[0].breakdown) == pytest.approx(1)
    assert ordered[0].score == pytest.approx(sum(c.contribution for c in ordered[0].breakdown), abs=0.1)


def test_equal_npvs_share_a_place_and_the_score_stays_in_range() -> None:
    results = [
        evaluate(product(name, payload_kg=1500), [PAYLOAD], VALUES, include_rnd=False) for name in "ABCD"
    ]
    npv = (10e6, 5e6, 5e6, 1e6)
    estimates = {
        r.candidate.product_id: QuickEstimate(value, 3.0) for r, value in zip(results, npv, strict=True)
    }
    points = [_economics(r.candidate, results, estimates, 7.0)[0] for r in results]
    assert points == pytest.approx([100, 200 / 3, 200 / 3, 100 / 3])


def test_candidate_that_does_not_pay_back_ranks_after_one_that_does() -> None:
    # Few cheap, mature machines (high score on every other criterion) that free little labour.
    tractor = evaluate(
        replace(product("Тягач", robots=4, capex=10e6, payload_kg=1500), cases_count=5),
        [PAYLOAD],
        VALUES,
        include_rnd=False,
    )
    amr = evaluate(
        replace(product("AMR", robots=20, capex=80e6, payload_kg=1500), trl=6),
        [PAYLOAD],
        VALUES,
        include_rnd=False,
    )
    estimates = {
        tractor.candidate.product_id: QuickEstimate(-17e6, 19.3),
        amr.candidate.product_id: QuickEstimate(40e6, 4.8),
    }
    ordered = rank([tractor, amr], WEIGHTS, estimates, 7.0)
    assert [r.candidate.name for r in ordered] == ["AMR", "Тягач"]
    towing = next(c for c in ordered[1].breakdown if c.criterion == "cost_efficiency")
    assert towing.points == 0
    assert "дольше порога 7 лет" in towing.explanation
    assert ordered[1].rank == 2
