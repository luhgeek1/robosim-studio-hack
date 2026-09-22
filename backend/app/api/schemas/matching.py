from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.catalog import Product
from app.engine.matching import CandidateStatus
from app.service.matching.service import ESTIMATE_NOTE, CandidateView, MatchingOutcome, ProcessMatchingView


class Reason(ApiModel):
    code: str
    text: str
    severity: str
    spec_key: str | None = None
    required: float | None = None
    actual: float | None = None
    unit: str | None = None
    param_key: str | None = None


class ScoreComponent(ApiModel):
    criterion: str
    name: str
    weight: float
    points: float = Field(ge=0, le=100)
    contribution: float
    explanation: str


class MissingData(ApiModel):
    spec_key: str
    name: str
    why_needed: str


class Estimate(ApiModel):
    robots_count: int | None = None
    capex_rub: float | None = None
    payback_years: float | None = None
    note: str | None = None


class Candidate(ApiModel):
    product: Product
    offer_id: UUID | None
    status: CandidateStatus
    rank: int | None = None
    score: float | None = Field(default=None, ge=0, le=100)
    score_breakdown: list[ScoreComponent] = Field(default_factory=list)
    reasons: list[Reason]
    missing_data: list[MissingData]
    estimate: Estimate | None = None

    @classmethod
    def from_domain(cls, view: CandidateView) -> "Candidate":
        result = view.result
        return cls(
            product=Product.from_domain(view.summary),
            offer_id=view.data.offer.id if view.data.offer else None,
            status=result.status,
            rank=result.rank,
            score=result.score,
            score_breakdown=[
                ScoreComponent(
                    criterion=c.criterion,
                    name=c.name,
                    weight=round(c.weight, 4),
                    points=c.points,
                    contribution=round(c.contribution, 2),
                    explanation=c.explanation,
                )
                for c in result.breakdown
            ],
            reasons=[
                Reason(
                    code=r.code,
                    text=r.text,
                    severity=r.severity.value,
                    spec_key=r.spec_key,
                    required=r.required,
                    actual=r.actual,
                    unit=r.unit,
                )
                for r in result.reasons
            ],
            missing_data=[
                MissingData(spec_key=m.spec_key, name=m.name, why_needed=m.why_needed)
                for m in result.missing_data
            ],
            estimate=Estimate(
                robots_count=view.data.input.robots_estimate,
                capex_rub=view.data.input.capex_estimate_rub,
                payback_years=view.economics.payback_years if view.economics else None,
                note=ESTIMATE_NOTE,
            ),
        )


class SolutionTypeMatch(ApiModel):
    key: str
    name: str
    applicable: bool
    reason: str | None = None
    candidates_count: int = 0


class ProcessMatching(ApiModel):
    process_key: str
    name: str
    demand_summary: str | None = None
    solution_types: list[SolutionTypeMatch]
    candidates: list[Candidate]
    no_fit_message: str | None = None

    @classmethod
    def from_domain(cls, view: ProcessMatchingView) -> "ProcessMatching":
        return cls(
            process_key=view.process_key,
            name=view.name,
            demand_summary=view.demand_summary,
            solution_types=[SolutionTypeMatch.model_validate(t) for t in view.solution_types],
            candidates=[Candidate.from_domain(c) for c in view.candidates],
            no_fit_message=view.no_fit_message,
        )


class MatchingTotals(ApiModel):
    fit: int = 0
    check: int = 0
    excluded: int = 0


class MatchingResult(ApiModel):
    project_id: UUID
    project_version: int
    catalog_version: str
    computed_at: datetime
    weights: dict[str, float]
    processes: list[ProcessMatching]
    totals: MatchingTotals | None = None

    @classmethod
    def from_domain(cls, item: MatchingOutcome) -> "MatchingResult":
        return cls(
            project_id=item.project_id,
            project_version=item.project_version,
            catalog_version=item.catalog_version,
            computed_at=item.computed_at,
            weights=item.weights,
            processes=[ProcessMatching.from_domain(p) for p in item.processes],
            totals=MatchingTotals(**item.totals),
        )


class MatchingRunRequest(ApiModel):
    weights: dict[str, float] | None = None
    include_rnd: bool | None = Field(default=None, description="Показывать продукты в стадии разработки")
    process_keys: list[str] | None = Field(default=None, description="Ограничить процессами")


class ManualAddRequest(ApiModel):
    process_key: str
    product_id: UUID
    offer_id: UUID | None = None
    acknowledge_warning: bool = Field(description="Пользователь подтвердил, что видит причины исключения")
