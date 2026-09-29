import ast
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import Requirement
from app.engine.expressions import ExpressionError, MissingValueError, parse
from app.engine.trace import fmt

TRL_SCALE_MAX = 9
POINTS_MAX = 100.0
CRITERIA = ("performance", "cost_efficiency", "infrastructure_fit", "maturity", "data_quality", "references")
CRITERION_NAMES = {
    "performance": "Производительность на объекте",
    "cost_efficiency": "Экономика решения",
    "infrastructure_fit": "Совместимость с объектом",
    "maturity": "Зрелость (УГТ)",
    "data_quality": "Полнота и подтверждённость ТТХ",
    "references": "Внедрения",
}
_UNRELIABLE = frozenset(
    {ProvenanceStatus.ASSUMPTION, ProvenanceStatus.MISSING, ProvenanceStatus.LLM_SUGGESTED}
)


class CandidateStatus(StrEnum):
    FIT = "fit"
    CHECK = "check"
    EXCLUDED = "excluded"
    MANUAL = "manual"


class Severity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    BLOCKING = "blocking"


@dataclass(frozen=True, slots=True)
class SpecFact:
    value: float
    status: ProvenanceStatus


@dataclass(frozen=True, slots=True)
class CandidateInput:
    product_id: UUID
    name: str
    solution_type: str
    stage: str
    trl: int | None
    completeness: float
    price_rub: float
    cases_count: int
    specs: Mapping[str, SpecFact]
    spec_names: Mapping[str, str]
    robots_estimate: int | None = None
    capex_estimate_rub: float | None = None


@dataclass(frozen=True, slots=True)
class Reason:
    code: str
    text: str
    severity: Severity
    spec_key: str | None = None
    required: float | None = None
    actual: float | None = None
    unit: str | None = None


@dataclass(frozen=True, slots=True)
class MissingData:
    spec_key: str
    name: str
    why_needed: str


@dataclass(frozen=True, slots=True)
class ScoreComponent:
    criterion: str
    name: str
    weight: float
    points: float
    explanation: str

    @property
    def contribution(self) -> float:
        return self.weight * self.points


@dataclass(slots=True)
class CandidateResult:
    candidate: CandidateInput
    status: CandidateStatus
    reasons: list[Reason] = field(default_factory=list)
    missing_data: list[MissingData] = field(default_factory=list)
    checks_passed: int = 0
    checks_evaluated: int = 0
    score: float | None = None
    breakdown: list[ScoreComponent] = field(default_factory=list)
    rank: int | None = None


def _required(requirement: Requirement, values: Mapping[str, float | None]) -> float | None:
    try:
        return parse(requirement.required or "").evaluate(values)
    except (MissingValueError, ExpressionError):
        return None


def _holds(source: str, values: Mapping[str, float | None]) -> bool | None:
    """A condition or a yes/no number (1 — yes); None when the object has not given the values yet."""
    expression = parse(source)
    try:
        if isinstance(expression.tree, ast.Compare):
            return expression.check(values)
        return expression.evaluate(values) != 0
    except MissingValueError:
        return None


def _skipped(result: CandidateResult, requirement: Requirement) -> None:
    result.reasons.append(
        Reason(
            "OBJECT_PARAM_MISSING",
            f"{requirement.message}: у объекта не задан параметр, проверка пропущена",
            Severity.INFO,
            requirement.spec,
        )
    )


def _check_object(
    result: CandidateResult, requirement: Requirement, values: Mapping[str, float | None]
) -> None:
    """A condition on the object for this type of solution: a failed one is a stated risk or an exclusion."""
    holds = _holds(requirement.condition or "", values)
    if holds is None:
        _skipped(result, requirement)
        return
    result.checks_evaluated += 1
    if holds:
        result.checks_passed += 1
        return
    severity = Severity.BLOCKING if requirement.severity == "blocking" else Severity.WARNING
    text = f"{requirement.message}. {requirement.why_needed}".strip(". ")
    result.reasons.append(Reason(requirement.key.upper(), text, severity))


def _passes(actual: float, requirement: Requirement, required: float) -> bool:
    return actual >= required if requirement.comparison == "gte" else actual <= required


def _check_requirement(
    result: CandidateResult, requirement: Requirement, values: Mapping[str, float | None]
) -> None:
    candidate = result.candidate
    if requirement.when is not None and not _holds(requirement.when, values):
        return
    if requirement.kind == "object":
        _check_object(result, requirement, values)
        return
    required = _required(requirement, values)
    unit = requirement.unit or ""
    if required is None or requirement.spec is None:
        _skipped(result, requirement)
        return
    fact = candidate.specs.get(requirement.spec)
    name = candidate.spec_names.get(requirement.spec, requirement.spec)
    if fact is None or fact.status in _UNRELIABLE:
        result.missing_data.append(
            MissingData(requirement.spec, name, requirement.why_needed.replace("{required}", fmt(required)))
        )
        text = (
            f"Нет подтверждённых данных: {name}"
            if fact is None
            else f"{name}: значение — допущение, нужна проверка"
        )
        result.reasons.append(
            Reason("SPEC_MISSING", text, Severity.WARNING, requirement.spec, required, None, unit)
        )
        return
    result.checks_evaluated += 1
    sign = "≥" if requirement.comparison == "gte" else "≤"
    if not _passes(fact.value, requirement, required):
        text = f"{requirement.message}: {fmt(fact.value)} {unit}, нужно {sign} {fmt(required)} {unit}".strip()
        result.reasons.append(
            Reason(
                requirement.key.upper(), text, Severity.BLOCKING, requirement.spec, required, fact.value, unit
            )
        )
        return
    result.checks_passed += 1
    claim = " (заявка производителя)" if fact.status == ProvenanceStatus.VENDOR_CLAIM else ""
    text = f"{name}: {fmt(fact.value)} {unit} {sign} {fmt(required)} {unit}{claim}".replace("  ", " ")
    result.reasons.append(
        Reason(
            f"{requirement.key.upper()}_OK", text, Severity.INFO, requirement.spec, required, fact.value, unit
        )
    )


def evaluate(
    candidate: CandidateInput,
    requirements: Sequence[Requirement],
    values: Mapping[str, float | None],
    *,
    include_rnd: bool,
) -> CandidateResult:
    """Hard checks (ТЗ 3.4.2): a confirmed mismatch excludes; missing product data → «требует проверки»."""
    result = CandidateResult(candidate=candidate, status=CandidateStatus.FIT)
    for requirement in requirements:
        if not requirement.solution_types or candidate.solution_type in requirement.solution_types:
            _check_requirement(result, requirement, values)
    if candidate.stage == "rnd":
        severity = Severity.WARNING if include_rnd else Severity.BLOCKING
        result.reasons.append(
            Reason("RND_STAGE", "Продукт в стадии НИОКР — серийных внедрений нет", severity)
        )
    if candidate.price_rub <= 0:
        result.reasons.append(
            Reason("PRICE_MISSING", "Нет цены в каталоге — экономику не оценить", Severity.WARNING)
        )
    if any(r.severity == Severity.BLOCKING for r in result.reasons):
        result.status = CandidateStatus.EXCLUDED
    elif result.missing_data or any(r.severity == Severity.WARNING for r in result.reasons):
        result.status = CandidateStatus.CHECK
    return result


def _relative(value: float | None, best: float | None, *, lower_is_better: bool) -> float:
    if value is None or best is None or value <= 0:
        return 0.0
    ratio = best / value if lower_is_better else value / best
    return POINTS_MAX * ratio


def _economics(
    c: CandidateInput, peers: Sequence[CandidateResult], npv: Mapping[UUID, float]
) -> tuple[float, str]:
    """NPV of buying the solution for the process, relative to the best one: cheap hardware that frees little
    labour (a tow tractor replaces drivers, not loaders) must not outrank a solution that pays back."""
    if npv:
        known = [npv[p.candidate.product_id] for p in peers if p.candidate.product_id in npv]
        own = npv.get(c.product_id)
        if own is None:
            return 0.0, "Экономика не оценена — нет модели производительности"
        # Place by NPV among the process's candidates: robust to an outlier, and a smaller loss still ranks
        # higher when no candidate pays back (the object's fixed costs are charged to each one in full).
        # Distinct NPV values on both sides: equal NPVs share a place, and the score stays within 0…100.
        better = len({value for value in known if value > own})
        places = len(set(known)) - 1
        points = POINTS_MAX * (1 - better / places) if places else POINTS_MAX
        verdict = "окупается" if own > 0 else "не окупается за горизонт"
        place = f"{better + 1}-е место из {len(known)}"
        return points, f"NPV покупки {fmt(own / 1e6)} млн ₽ за горизонт — {verdict}; {place}"
    capex = [p.candidate.capex_estimate_rub for p in peers if p.candidate.capex_estimate_rub]
    if not c.capex_estimate_rub:
        return 0.0, "CAPEX не оценён"
    points = _relative(c.capex_estimate_rub, min(capex, default=None), lower_is_better=True)
    return points, f"Ориентировочный CAPEX оборудования {fmt(c.capex_estimate_rub / 1e6)} млн ₽"


def _components(
    result: CandidateResult,
    peers: Sequence[CandidateResult],
    weights: Mapping[str, float],
    npv: Mapping[UUID, float],
) -> list[ScoreComponent]:
    c = result.candidate
    robots = [p.candidate.robots_estimate for p in peers if p.candidate.robots_estimate]
    economics, economics_note = _economics(c, peers, npv)
    cases = max((p.candidate.cases_count for p in peers), default=0)
    infra = POINTS_MAX * result.checks_passed / result.checks_evaluated if result.checks_evaluated else 0.0
    points = {
        "performance": _relative(c.robots_estimate, min(robots, default=None), lower_is_better=True),
        "cost_efficiency": economics,
        "infrastructure_fit": infra,
        "maturity": POINTS_MAX * (c.trl or 0) / TRL_SCALE_MAX,
        "data_quality": POINTS_MAX * c.completeness,
        "references": POINTS_MAX * c.cases_count / cases if cases else 0.0,
    }
    notes = {
        "performance": f"Нужно ≈{c.robots_estimate} шт."
        if c.robots_estimate
        else "Производительность не оценена — нет ТТХ",
        "cost_efficiency": economics_note,
        "infrastructure_fit": f"Пройдено проверок: {result.checks_passed} из {result.checks_evaluated}",
        "maturity": f"УГТ {c.trl} из {TRL_SCALE_MAX}" if c.trl else "УГТ не указан",
        "data_quality": f"Заполнено {round(c.completeness * POINTS_MAX)} % ключевых полей карточки",
        "references": f"Внедрений в данных: {c.cases_count}",
    }
    total = sum(weights.get(key, 0.0) for key in CRITERIA) or 1.0
    return [
        ScoreComponent(
            key, CRITERION_NAMES[key], weights.get(key, 0.0) / total, round(points[key], 1), notes[key]
        )
        for key in CRITERIA
    ]


def rank(
    results: list[CandidateResult], weights: Mapping[str, float], npv: Mapping[UUID, float] | None = None
) -> list[CandidateResult]:
    """Explainable score = Σ weight × points; points are relative to the best candidate of the process.

    `npv` — the quick purchase estimate per product; without it the economics criterion compares CAPEX."""
    scored = [r for r in results if r.status != CandidateStatus.EXCLUDED]
    for result in scored:
        result.breakdown = _components(result, scored, weights, npv or {})
        result.score = round(sum(component.contribution for component in result.breakdown), 1)
    order = {
        CandidateStatus.FIT: 0,
        CandidateStatus.MANUAL: 1,
        CandidateStatus.CHECK: 2,
        CandidateStatus.EXCLUDED: 3,
    }
    ordered = sorted(results, key=lambda r: (order[r.status], -(r.score or 0.0), r.candidate.name))
    for position, result in enumerate([r for r in ordered if r.status == CandidateStatus.FIT], start=1):
        result.rank = position
    return ordered
