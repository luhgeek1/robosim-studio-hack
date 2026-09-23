from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import ConflictError, ScenarioIncompleteError
from app.db.models import CalculationRun, StoredFile
from app.db.repositories.layouts import LayoutRepository
from app.db.repositories.simulations import SimulationRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.reports.models import ParamRow, ReportModel, ReportSection, ScenarioReport, Visual
from app.engine.calculation import CalculationError
from app.service.layouts.reader import LayoutReader
from app.service.matching.service import MatchingService
from app.service.projects.context import ProjectLoader
from app.service.projects.processes import ProcessService
from app.service.scenarios.analysis import AnalysisService
from app.service.scenarios.comparison import ComparisonService
from app.service.scenarios.narrative import narrative
from app.service.simulations.service import plan_json

REPORT_SEED = 1
TOP_CANDIDATES = 3
_PROBABILITY_LABELS = {"npv_positive": "Вероятность NPV > 0"}
_BASE_LIMITATIONS = [
    "Экспресс-оценка по параметрам объекта: не заменяет проектирование и обследование.",
    "Схема склада построена генератором, а не по чертежу: маршруты и узкие места "
    "уточняются по плану объекта.",
    "Суммы с НДС (единая база ТЗ); налог на прибыль и амортизация приведены справочно.",
    "Имитация покрывает перевозку паллет и отбор «товар к человеку»; число роботов "
    "прочих процессов — по циклу.",
]


@dataclass(frozen=True, slots=True)
class ReportRequest:
    sections: list[ReportSection]
    scenario_ids: list[UUID]
    visual_ids: list[UUID]
    title: str | None
    live_formulas: bool = True


def _shown(value: Any, options: list[dict[str, str]] | None) -> Any:
    """Enum values by their label, booleans as «да / нет» — the report is read by people, not code."""
    if isinstance(value, bool):
        return "да" if value else "нет"
    for option in options or []:
        if option.get("value") == value:
            return option.get("label", value)
    return value


def _probability_label(key: str) -> str:
    if key.startswith("payback_le_"):
        years = key.removeprefix("payback_le_").removesuffix("y")
        return f"Вероятность окупиться за {years.replace('.', ',')} года и быстрее"
    return _PROBABILITY_LABELS.get(key, key)


class ReportCollector:
    """Gathers everything the report shows, recalculating stale scenarios so the numbers are current."""

    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._loader = ProjectLoader(uow)
        self._comparison = ComparisonService(uow, user)
        self._analysis = AnalysisService(uow, user)
        self._simulations = SimulationRepository(uow.session)
        self._layouts = LayoutReader(uow)

    async def collect(self, project_id: UUID, request: ReportRequest) -> ReportModel:
        context = await self._loader.context(self._user, project_id)
        project, object_type = context.project, context.object_type
        try:
            comparison = await self._comparison.compare(project_id, recalculate_stale=True)
        except ConflictError as exc:
            raise ConflictError(f"Отчёт строится по расчётам: {exc.detail}") from exc
        chosen = set(request.scenario_ids)
        compared = [
            c for c in comparison.scenarios if not chosen or c.scenario.id in chosen or c.scenario.is_baseline
        ]
        scenarios = [await self._scenario(c.scenario, c.stored.run) for c in compared]
        groups = {g.key: g.name for g in object_type.parameter_groups}
        generated_at = datetime.now(UTC)
        model = ReportModel(
            title=request.title or f"Предварительная оценка роботизации: {project.name}",
            project={
                "id": str(project.id),
                "name": project.name,
                "object_type_name": object_type.name,
                "organization": project.organization,
                "version": project.version,
            },
            generated_at=generated_at,
            author=self._user.email,
            versions={
                **(scenarios[0].result.get("versions", {}) if scenarios else {}),
                "layout_version": await self._layout_version(project_id),
                "computed_at": generated_at.isoformat(),
            },
            sections=request.sections or list(ReportSection),
            params=[
                ParamRow(
                    groups.get(p.definition.group, p.definition.group),
                    p.key,
                    p.definition.name,
                    _shown(p.value, p.definition.enum_values),
                    p.unit,
                    p.provenance.status.value,
                    p.provenance.source.title if p.provenance.source else None,
                )
                for p in context.params
            ],
            scenarios=scenarios,
            comparison=self._comparison_json(comparison, compared),
            process_names={process.key: process.name for process in object_type.processes},
            live_formulas=request.live_formulas,
        )
        model.processes = await self._processes(context.project.id)
        model.matching = await self._matching(project_id)
        await self._risks(model)
        await self._layout(model, project_id)
        model.visuals = await self._visuals(request.visual_ids, project_id)
        self._assumptions(model)
        model.limitations = self._limitations(model)
        return model

    async def _layout_version(self, project_id: UUID) -> int | None:
        layout = await self._layouts.layout(project_id)
        return layout.version if layout else None

    async def _scenario(self, scenario: Any, run: CalculationRun) -> ScenarioReport:
        story = narrative(run)
        report = ScenarioReport(
            id=str(scenario.id),
            name=scenario.name,
            kind=scenario.kind.value,
            is_baseline=scenario.is_baseline,
            is_recommended=scenario.is_recommended,
            financing=scenario.financing,
            calculated_at=run.computed_at,
            result={
                **run.result,
                "versions": {
                    "project_version": run.project_version,
                    "catalog_version": run.catalog_version,
                    "norm_set_version": run.norm_set_version,
                    "engine_version": run.engine_version,
                },
            },
            trace=run.trace,
            narrative={
                "executive_summary": story.executive_summary,
                "key_findings": story.key_findings,
                "next_steps": story.next_steps,
                "risks_text": story.risks_text,
            },
        )
        if not scenario.is_baseline:
            report.simulation = await self._simulation(scenario.id)
        return report

    async def _simulation(self, scenario_id: UUID) -> dict[str, Any] | None:
        run = await self._simulations.latest_done(scenario_id)
        sweep = await self._uow.jobs.latest_sweep(scenario_id)
        if run is None and sweep is None:
            return None
        return {
            "id": str(run.id) if run else None,
            "summary": run.summary if run else None,
            "fleet": run.fleet if run else [],
            "config": run.config if run else {},
            "heatmap": run.heatmap if run else None,
            "sweep": sweep.result if sweep else None,
        }

    @staticmethod
    def _comparison_json(view: Any, compared: list[Any]) -> dict[str, Any]:
        names = {str(c.scenario.id): c.scenario.name for c in compared}
        rows = [{**row, "values": {str(k): v for k, v in row["values"].items()}} for row in view.rows]
        return {
            "names": names,
            "rows": rows,
            "recommendation": view.recommendation,
            "overlay": {sid: points for sid, points in view.overlay.items() if sid in names},
        }

    async def _processes(self, project_id: UUID) -> list[dict[str, Any]]:
        overview = await ProcessService(self._uow, self._user).overview(project_id)
        return [
            {
                "name": v.result.name,
                "demand_per_day": v.result.demand_per_day,
                "peak_per_hour": v.result.peak_per_hour,
                "fte": v.result.fte,
                "cost_rub_year": v.result.cost_rub_year,
                "share": v.result.share_of_labor_cost,
            }
            for v in overview.processes
        ]

    async def _matching(self, project_id: UUID) -> list[dict[str, Any]]:
        outcome = await MatchingService(self._uow, self._user).run(project_id)
        return [
            {
                "name": process.name,
                "candidates": [
                    {
                        "name": c.data.product.name,
                        "status": c.result.status.value,
                        "score": c.result.score,
                        "robots": c.result.candidate.robots_estimate,
                        "payback_years": c.economics.payback_years if c.economics else None,
                        "reasons": [r.text for r in c.result.reasons],
                    }
                    for c in process.candidates[:TOP_CANDIDATES]
                ],
            }
            for process in outcome.processes
        ]

    async def _risks(self, model: ReportModel) -> None:
        analysed = model.analysed
        if analysed is None:
            return
        scenario_id = UUID(analysed.id)
        try:
            sensitivity = await self._analysis.sensitivity(scenario_id, "npv_rub", [], None)
            outcome = await self._analysis.monte_carlo(
                scenario_id, n=None, metric="npv_rub", requests=[], seed=REPORT_SEED
            )
            survey = await self._analysis.survey(scenario_id)
        except (ConflictError, ScenarioIncompleteError, CalculationError):
            return
        model.sensitivity = {
            "base": sensitivity.base_value,
            "items": [
                {
                    "name": i.driver.name,
                    "kind": i.driver.kind.value,
                    "low": i.driver.low,
                    "high": i.driver.high,
                    "metric_at_low": i.metric_at_low,
                    "metric_at_high": i.metric_at_high,
                    "swing": i.swing,
                }
                for i in sensitivity.items
            ],
        }
        model.monte_carlo = {
            "runs": outcome.n,
            "p10": outcome.p10,
            "p50": outcome.p50,
            "p90": outcome.p90,
            "mean": outcome.mean,
            "probabilities": {_probability_label(k): v for k, v in outcome.probability.items()},
            "histogram": [
                {"from": outcome.bins[i], "to": outcome.bins[i + 1], "count": count}
                for i, count in enumerate(outcome.counts)
            ],
        }
        model.survey = [
            {
                "name": i.driver.name,
                "current_value": i.current_value,
                "swing": i.swing,
                "recommendation": i.recommendation,
                "how_to_measure": i.how_to_measure,
            }
            for i in survey.items
        ]

    async def _layout(self, model: ReportModel, project_id: UUID) -> None:
        layout = await self._layouts.layout(project_id)
        if layout is not None:
            model.layout = {"plan": plan_json(layout), "stats": layout.stats, "warnings": layout.warnings}

    async def _visuals(self, ids: list[UUID], project_id: UUID) -> list[Visual]:
        visuals: list[Visual] = []
        repo = LayoutRepository(self._uow.session)
        for file_id in ids:
            stored: StoredFile | None = await repo.file(file_id)
            if stored is not None and stored.project_id == project_id:
                visuals.append(Visual(stored.filename, stored.content_type, stored.data))
        return visuals

    @staticmethod
    def _assumptions(model: ReportModel) -> None:
        norms: dict[str, dict[str, Any]] = {}
        for scenario in model.scenarios:
            for norm in scenario.result.get("assumptions_used", []):
                norms.setdefault(norm["key"], norm)
        model.assumptions = sorted(norms.values(), key=lambda n: n["name"])
        sources: dict[str, dict[str, Any]] = {}
        for norm in model.assumptions:
            source = norm.get("source")
            if source:
                sources.setdefault(source["title"], source)
        for param in model.params:
            if param.source:
                sources.setdefault(param.source, {"title": param.source, "kind": "organizer_dataset"})
        model.sources = sorted(sources.values(), key=lambda s: s["title"])

    @staticmethod
    def _limitations(model: ReportModel) -> list[str]:
        team = sum(1 for n in model.assumptions if (n.get("source") or {}).get("kind") == "team_assumption")
        result = [*_BASE_LIMITATIONS]
        if team:
            result.append(
                f"В расчёте {team} нормативов — допущения команды с обоснованием; их нужно подтвердить."
            )
        for scenario in model.scenarios:
            skipped = ((scenario.simulation or {}).get("summary") or {}).get("skipped_processes") or []
            result += [item["reason"] for item in skipped]
        return list(dict.fromkeys(result))
