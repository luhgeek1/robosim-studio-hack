import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import DomainError, ErrorCode, NotFoundError
from app.db.models import ManualCandidate, MatchingSettings, Product
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.matching import MatchingRepository
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.catalog import ProductSummary
from app.domain.reference import ProcessDef
from app.engine.matching import CRITERIA, CandidateResult, CandidateStatus, QuickEstimate, evaluate, rank
from app.engine.trace import fmt
from app.service.catalog.mappers import to_summary
from app.service.matching.candidates import (
    CandidateData,
    ProcessSizing,
    build_candidate,
    choose_offer,
    cycle_extras,
    demand_input,
    route_length,
    specs_by_product,
)
from app.service.matching.economics import QuickEconomics, payback_limit_years, quick_economics
from app.service.projects.context import ProjectContext, ProjectLoader
from app.service.projects.processes import ProcessAnalysis, ProcessService, ProcessView

WEIGHT_NORM_PREFIX = "matching_weight_"
_STATUS_ORDER = (CandidateStatus.FIT, CandidateStatus.MANUAL, CandidateStatus.CHECK, CandidateStatus.EXCLUDED)
UNIT_LABELS = {
    "pallet": "палл",
    "line": "строк",
    "item": "шт",
    "m2": "м²",
    "trip": "рейсов",
    "kg": "кг",
    "bag": "мест",
    "portion": "порций",
    "container": "конт.",
}
ESTIMATE_NOTE = (
    "Аналитическая оценка по циклу; точное число даст имитация. Окупаемость — покупка одного этого решения "
    "с затратами объекта (интеграция, Wi-Fi, обучение) целиком"
)


@dataclass(frozen=True, slots=True)
class CandidateView:
    data: CandidateData
    result: CandidateResult
    summary: ProductSummary
    economics: QuickEconomics | None = None


@dataclass(frozen=True, slots=True)
class SolutionTypeView:
    key: str
    name: str
    applicable: bool
    reason: str | None
    candidates_count: int


@dataclass(frozen=True, slots=True)
class ProcessMatchingView:
    process_key: str
    name: str
    demand_summary: str | None
    solution_types: list[SolutionTypeView]
    candidates: list[CandidateView]
    no_fit_message: str | None


@dataclass(frozen=True, slots=True)
class MatchingOutcome:
    project_id: UUID
    project_version: int
    catalog_version: str
    computed_at: datetime
    weights: dict[str, float]
    processes: list[ProcessMatchingView]
    totals: dict[str, int] = field(default_factory=dict)


def _demand_summary(view: ProcessView) -> str | None:
    result = view.result
    if result.peak_per_hour is None or result.demand_per_day is None:
        return None
    unit = UNIT_LABELS.get(view.demand_unit, view.demand_unit)
    return f"{fmt(math.ceil(result.peak_per_hour))} {unit}/ч в пик, {fmt(result.demand_per_day)} {unit}/сут"


class MatchingService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._loader = ProjectLoader(uow)
        self._processes = ProcessService(uow, user)
        self._catalog = CatalogRepository(uow.session)
        self._reference = ReferenceRepository(uow.session)
        self._repo = MatchingRepository(uow.session)

    def _default_weights(self, analysis: ProcessAnalysis) -> dict[str, float]:
        return {
            c: analysis.norms.value(f"{WEIGHT_NORM_PREFIX}{c}")
            for c in CRITERIA
            if analysis.norms.optional(f"{WEIGHT_NORM_PREFIX}{c}")
        }

    async def run(
        self,
        project_id: UUID,
        *,
        weights: dict[str, float] | None = None,
        include_rnd: bool | None = None,
        process_keys: list[str] | None = None,
    ) -> MatchingOutcome:
        context = await self._loader.context(self._user, project_id)
        settings = await self._repo.settings(project_id)
        if weights is not None or include_rnd is not None or process_keys is not None:
            settings = await self._save_settings(project_id, settings, weights, include_rnd, process_keys)
        return await self.outcome(context, settings)

    async def outcome(self, context: ProjectContext, settings: MatchingSettings | None) -> MatchingOutcome:
        """Matching of an already loaded project; callers own the access check."""
        analysis = await self._processes.analyse(context)
        effective = {**self._default_weights(analysis), **(settings.weights if settings else {})}
        unknown = set(effective) - set(CRITERIA)
        if unknown or any(value < 0 for value in effective.values()):
            raise DomainError(
                f"Недопустимые веса: {sorted(unknown) or 'отрицательные значения'}",
                error_code=ErrorCode.BAD_REQUEST,
            )
        selected = set(settings.process_keys) if settings and settings.process_keys else None
        rnd = settings.include_rnd if settings else False
        views = [v for v in analysis.views if selected is None or v.result.process_key in selected]
        processes = [await self._process(analysis, view, effective, rnd) for view in views]
        totals = {
            status.value: 0
            for status in (CandidateStatus.FIT, CandidateStatus.CHECK, CandidateStatus.EXCLUDED)
        }
        for process in processes:
            for candidate in process.candidates:
                if candidate.result.status.value in totals:
                    totals[candidate.result.status.value] += 1
        return MatchingOutcome(
            project_id=context.project.id,
            project_version=context.project.version,
            catalog_version=await self._reference.data_version("catalog") or "none",
            computed_at=datetime.now(UTC),
            weights=effective,
            processes=processes,
            totals=totals,
        )

    async def _save_settings(
        self,
        project_id: UUID,
        settings: MatchingSettings | None,
        weights: dict[str, float] | None,
        include_rnd: bool | None,
        process_keys: list[str] | None,
    ) -> MatchingSettings:
        if settings is None:
            settings = MatchingSettings(project_id=project_id, weights={}, include_rnd=False, process_keys=[])
            self._repo.add(settings)
        if weights is not None:
            settings.weights = weights
        if include_rnd is not None:
            settings.include_rnd = include_rnd
        if process_keys is not None:
            settings.process_keys = process_keys
        await self._uow.flush()
        return settings

    async def _process(
        self, analysis: ProcessAnalysis, view: ProcessView, weights: dict[str, float], include_rnd: bool
    ) -> ProcessMatchingView:
        definition = next(
            p for p in analysis.context.object_type.processes if p.key == view.result.process_key
        )
        products = [
            product
            for product in await self._catalog.candidates(
                analysis.context.project.object_type, definition.key
            )
            # A product of a solution type the process does not use is a slip in the catalog mapping.
            if product.solution_type in definition.solution_types
        ]
        manual = [
            m for m in await self._repo.manual(analysis.context.project.id) if m.process_key == definition.key
        ]
        manual_ids = {m.product_id for m in manual}
        extra = await self._catalog.get_many(
            [pid for pid in manual_ids if pid not in {p.id for p in products}]
        )
        candidates = await self._candidates(analysis, definition, view, [*products, *extra])
        results: list[CandidateResult] = []
        for data in candidates:
            result = evaluate(data.input, definition.requirements, analysis.values, include_rnd=include_rnd)
            if data.product.id in manual_ids:
                result.status = CandidateStatus.MANUAL
            results.append(result)
        by_id = {data.product.id: data for data in candidates}
        economics = {
            r.candidate.product_id: quick_economics(analysis, definition.key, by_id[r.candidate.product_id])
            for r in results
            if r.candidate.robots_estimate and r.status != CandidateStatus.EXCLUDED
        }
        estimates = {
            pid: QuickEstimate(e.npv_rub, e.payback_years) for pid, e in economics.items() if e is not None
        }
        ordered = rank(results, weights, estimates, payback_limit_years(analysis))
        summaries = await self._summaries([data.product for data in candidates])
        views = [
            CandidateView(
                by_id[r.candidate.product_id],
                r,
                summaries[r.candidate.product_id],
                economics.get(r.candidate.product_id),
            )
            for r in ordered
        ]
        types = await self._solution_types(definition, views)
        fits = [v for v in views if v.result.status in {CandidateStatus.FIT, CandidateStatus.CHECK}]
        return ProcessMatchingView(
            process_key=definition.key,
            name=definition.name,
            demand_summary=_demand_summary(view),
            solution_types=types,
            candidates=views,
            no_fit_message=None
            if fits
            else "Подходящих решений в каталоге нет: все кандидаты не проходят жёсткие проверки",
        )

    async def _candidates(
        self, analysis: ProcessAnalysis, definition: ProcessDef, view: ProcessView, products: list[Product]
    ) -> list[CandidateData]:
        ids = [p.id for p in products]
        specs = specs_by_product(await self._catalog.specs(ids))
        cases = await self._catalog.cases_count(ids)
        offers = await self._catalog.offers_for(ids)
        industry = await self._catalog.industry_key(analysis.context.object_type.industry)
        keys = {k.key: k for k in await self._reference.spec_keys()}
        models = {t.key: t.sizing_model for t in await self._reference.solution_types()}
        sizing = ProcessSizing(
            demand=demand_input(definition, view.result, analysis.values),
            norms=analysis.norms,
            distance=route_length(definition, analysis.values),
            spec_keys=keys,
            extras=cycle_extras(definition, analysis.values) or (),
        )
        return [
            build_candidate(
                product,
                choose_offer([o for o in offers if o.product_id == product.id], industry),
                specs.get(product.id, []),
                cases.get(product.id, 0),
                models.get(product.solution_type),
                sizing,
            )
            for product in products
        ]

    async def _summaries(self, products: list[Product]) -> dict[UUID, ProductSummary]:
        manufacturers = await self._catalog.manufacturers({p.manufacturer_id for p in products})
        names = await self._catalog.solution_type_names()
        return {p.id: to_summary(p, manufacturers[p.manufacturer_id], names) for p in products}

    async def _solution_types(
        self, definition: ProcessDef, views: list[CandidateView]
    ) -> list[SolutionTypeView]:
        names = await self._catalog.solution_type_names()
        result: list[SolutionTypeView] = []
        for key in definition.solution_types:
            own = [v for v in views if v.data.product.solution_type == key]
            usable = [v for v in own if v.result.status != CandidateStatus.EXCLUDED]
            reason = None
            if not own:
                reason = "В каталоге нет продуктов этого типа для объекта"
            elif not usable:
                blocking = next(
                    (r.text for v in own for r in v.result.reasons if r.severity == "blocking"), None
                )
                reason = blocking or "Все продукты исключены"
            result.append(SolutionTypeView(key, names.get(key, key), bool(usable), reason, len(own)))
        return result

    async def compatibility(
        self, project_id: UUID, product_ids: list[UUID], process_key: str | None
    ) -> dict[str, str]:
        """Status of each product in the project's matching: for the given process or the best it fits."""
        outcome = await self.run(project_id)
        rank = {status: position for position, status in enumerate(_STATUS_ORDER)}
        result: dict[str, str] = {}
        for process in outcome.processes:
            if process_key and process.process_key != process_key:
                continue
            for candidate in process.candidates:
                product_id = candidate.data.product.id
                if product_id not in product_ids:
                    continue
                status = candidate.result.status.value
                current = result.get(str(product_id))
                if current is None or rank[CandidateStatus(status)] < rank[CandidateStatus(current)]:
                    result[str(product_id)] = status
        return result

    async def add_manual(
        self, project_id: UUID, process_key: str, product_id: UUID, offer_id: UUID | None, acknowledged: bool
    ) -> CandidateView:
        if not acknowledged:
            raise DomainError(
                "Подтвердите, что видите причины исключения продукта", error_code=ErrorCode.BAD_REQUEST
            )
        context = await self._loader.context(self._user, project_id)
        if process_key not in {p.key for p in context.object_type.processes}:
            raise NotFoundError("Процесс не найден у этого типа объекта")
        product = await self._catalog.get(product_id)
        if product is None or product.hidden_at is not None:
            raise NotFoundError("Продукт не найден")
        if await self._repo.manual_one(project_id, process_key, product_id) is None:
            self._repo.add(
                ManualCandidate(
                    project_id=project_id,
                    process_key=process_key,
                    product_id=product_id,
                    offer_id=offer_id,
                    created_by=self._user.email,
                )
            )
            await self._uow.flush()
        outcome = await self.run(project_id)
        process = next(p for p in outcome.processes if p.process_key == process_key)
        return next(c for c in process.candidates if c.data.product.id == product_id)
