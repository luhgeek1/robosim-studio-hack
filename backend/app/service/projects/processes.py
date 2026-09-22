from dataclasses import dataclass
from uuid import UUID

from app.core.errors import ConflictError, DomainError, ErrorCode
from app.db.repositories.catalog import CatalogRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.engine.demand import (
    DemandFormula,
    LaborGroupInput,
    ProcessDemandResult,
    ProcessInput,
    day_profile,
    process_demand,
    total_labor_cost,
)
from app.engine.trace import Book
from app.service.layouts.reader import LayoutReader
from app.service.projects.context import ProjectContext, ProjectLoader
from app.service.projects.norms import NormLoader

PAYROLL_COEFF_PARAM = "payroll_tax_coeff"
PAYROLL_SHARE_NORM = "payroll_tax_share"
PEAK_FACTOR_PARAM = "peak_factor"
PEAK_WINDOW_NORM = "sim_peak_window_hours"


@dataclass(frozen=True, slots=True)
class ProcessView:
    result: ProcessDemandResult
    demand_unit: str
    robotizable: bool
    solution_types: list[str]
    notes: list[str]
    hourly_profile: list[float] | None = None


@dataclass(frozen=True, slots=True)
class ProcessAnalysis:
    context: ProjectContext
    values: dict[str, float | None]
    norms: Book
    views: list[ProcessView]
    total_labor_cost_rub_year: float
    layout: Book


@dataclass(frozen=True, slots=True)
class ProcessesOverview:
    project_id: UUID
    project_version: int
    processes: list[ProcessView]
    total_labor_cost_rub_year: float
    working_hours_per_day: float | None
    peak_factor: float | None


def _groups(context: ProjectContext, values: dict[str, float | None]) -> dict[str, LaborGroupInput]:
    return {
        group.key: LaborGroupInput(
            key=group.key,
            name=group.name,
            headcount=values.get(group.headcount_param),
            salary_rub_month=values.get(group.salary_param) if group.salary_param else None,
        )
        for group in context.object_type.labor_groups
    }


def _profile(result: ProcessDemandResult, norms: Book) -> list[float] | None:
    """The same day profile the simulation plays: a peak window in the middle of the working day."""
    window = norms.optional(PEAK_WINDOW_NORM)
    if window is None or not result.hours_per_day or result.peak_factor is None:
        return None
    return [round(share, 5) for share in day_profile(result.hours_per_day, result.peak_factor, window.value)]


class ProcessService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._user = user
        self._loader = ProjectLoader(uow)
        self._catalog = CatalogRepository(uow.session)
        self._norms = NormLoader(uow)
        self._layouts = LayoutReader(uow)

    @staticmethod
    def _payroll_coefficient(values: dict[str, float | None]) -> float:
        coefficient = values.get(PAYROLL_COEFF_PARAM)
        if coefficient is not None:
            return coefficient
        share = values.get(PAYROLL_SHARE_NORM)
        if share is None:
            raise DomainError("Не задан коэффициент начислений на ФОТ", error_code=ErrorCode.PARAMS_INVALID)
        return 1 + share

    async def analyse(self, context: ProjectContext) -> ProcessAnalysis:
        values = context.numeric()
        norms = await self._norms.book(context.project.object_type)
        for key, quantity in norms.items.items():
            values.setdefault(key, quantity.value)
        layout = await self._layouts.book(context.project.id)
        for key, quantity in layout.items.items():
            values.setdefault(key, quantity.value)
        groups = _groups(context, values)
        payroll = self._payroll_coefficient(values)
        total = total_labor_cost(list(groups.values()), payroll)
        available = await self._catalog.products_per_process(context.project.object_type)
        names = {p.key: p.definition.name for p in context.params}
        views: list[ProcessView] = []
        for process in context.object_type.processes:
            demand = DemandFormula(**process.demand) if process.demand else None
            result = process_demand(
                ProcessInput(process.key, process.name, demand, process.labor_allocation),
                values,
                groups,
                payroll,
                total,
            )
            notes = [f"Нет данных: {names.get(key, key)}" for key in result.missing]
            if process.labor_allocation_note:
                notes.append(f"Распределение персонала: {process.labor_allocation_note}")
            views.append(
                ProcessView(
                    result=result,
                    demand_unit=process.demand_unit,
                    robotizable=available.get(process.key, 0) > 0,
                    solution_types=process.solution_types,
                    notes=notes,
                    hourly_profile=_profile(result, norms),
                )
            )
        return ProcessAnalysis(context, values, norms, views, total, layout)

    async def overview(self, project_id: UUID) -> ProcessesOverview:
        analysis = await self.analyse(await self._loader.context(self._user, project_id))
        views = analysis.views
        if views and all(v.result.demand_per_day is None for v in views):
            raise ConflictError(
                "Не хватает обязательных параметров, чтобы оценить процессы: заполните объёмы и режим работы",
                error_code=ErrorCode.PARAMS_INVALID,
            )
        project = analysis.context.project
        return ProcessesOverview(
            project_id=project.id,
            project_version=project.version,
            processes=views,
            total_labor_cost_rub_year=analysis.total_labor_cost_rub_year,
            working_hours_per_day=next(
                (v.result.hours_per_day for v in views if v.result.hours_per_day), None
            ),
            peak_factor=analysis.values.get(PEAK_FACTOR_PARAM),
        )
