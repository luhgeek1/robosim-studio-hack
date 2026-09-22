import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID

from app.core.errors import NotFoundError, ScenarioIncompleteError
from app.core.versions import ENGINE_VERSION
from app.db.models import CalculationRun, Scenario
from app.db.repositories.scenarios import ScenarioRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.project.models import ProjectStatus
from app.domain.scenario.models import ScenarioKind
from app.engine.calculation import CalculationError, CalculationResult, calculate
from app.engine.calibration import CalibrationCase, applicable
from app.engine.verdict import VerdictContext, assess_risks, interpret
from app.seeds.schemas import load_calibration
from app.service.projects.context import ProjectLoader
from app.service.scenarios.serialize import payload
from app.service.scenarios.service import ScenarioService
from app.service.scenarios.snapshot import Snapshot, SnapshotBuilder
from app.service.scenarios.state import VersionReader
from app.service.scenarios.views import RunStatus

CALCULATION_NOT_FOUND = "Расчёт не найден или недоступен"
MS_PER_S = 1000


@lru_cache(maxsize=1)
def calibration_cases() -> tuple[CalibrationCase, ...]:
    return tuple(CalibrationCase(**case.model_dump()) for case in load_calibration().cases)


@dataclass(frozen=True, slots=True)
class StoredCalculation:
    run: CalculationRun
    status: str


@dataclass(frozen=True, slots=True)
class Evaluation:
    """A calculation that has not been stored — used by sensitivity, Monte Carlo and rerun previews."""

    snapshot: Snapshot
    result: CalculationResult


def verdict_context(snapshot: Snapshot) -> VerdictContext:
    return VerdictContext(
        norms=snapshot.input.norms,
        budget_rub=snapshot.budget_rub,
        param_status={key: p.status for key, p in snapshot.param_provenance.items()},
        assumption_norms=snapshot.assumption_norms,
    )


class CalculationService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ScenarioRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._scenarios = ScenarioService(uow, user)
        self._builder = SnapshotBuilder(uow)
        self._versions = VersionReader(uow)

    async def snapshot(self, scenario: Scenario) -> Snapshot:
        context = await self._loader.context(self._user, scenario.project_id)
        versions = await self._versions.current(context.project)
        horizon = scenario.horizon_years or await self._scenarios.default_horizon(
            context.project.object_type, context.numeric()
        )
        return await self._builder.build(context, scenario, versions, horizon)

    async def evaluate(self, scenario_id: UUID) -> Evaluation:
        scenario = await self._scenarios.owned(scenario_id)
        snapshot = await self.snapshot(scenario)
        return Evaluation(snapshot, self._run_engine(snapshot))

    @staticmethod
    def _run_engine(snapshot: Snapshot, *, render: bool = True) -> CalculationResult:
        try:
            return calculate(snapshot.input, render=render)
        except CalculationError as exc:
            raise ScenarioIncompleteError(str(exc)) from exc

    async def calculate(self, scenario_id: UUID) -> StoredCalculation:
        scenario = await self._scenarios.owned(scenario_id)
        snapshot = await self.snapshot(scenario)
        started = time.perf_counter()
        result = self._run_engine(snapshot)
        context = verdict_context(snapshot)
        interpretation = interpret(result, context)
        risks = assess_risks(result, context)
        calibrations = (
            []
            if scenario.kind == ScenarioKind.BASELINE
            else applicable(
                calibration_cases(),
                {item.solution_type for item in snapshot.input.items},
                snapshot.input.financing.kind.value if scenario.kind != ScenarioKind.LEASE else "lease",
                snapshot.input.norms,
            )
        )
        body, trace = payload(result, snapshot, interpretation, risks, calibrations)
        metrics = result.economics.metrics
        run = CalculationRun(
            scenario_id=scenario.id,
            project_id=scenario.project_id,
            scenario_kind=scenario.kind,
            project_version=snapshot.versions.project_version,
            scenario_version=scenario.version,
            catalog_version=snapshot.versions.catalog_version,
            norm_set_version=snapshot.versions.norm_set_version,
            engine_version=ENGINE_VERSION,
            inputs_hash=snapshot.inputs_hash,
            duration_ms=int((time.perf_counter() - started) * MS_PER_S),
            created_by=self._user.email,
            capex_rub=metrics.capex_rub,
            effect_rub_year=metrics.effect_rub_year,
            npv_rub=metrics.npv_rub,
            payback_years=metrics.payback_years,
            verdict=interpretation.verdict.value,
            result=body,
            trace=trace,
            inputs=snapshot.inputs,
        )
        self._repo.add(run)
        project = snapshot.project
        if project.status in {ProjectStatus.DRAFT, ProjectStatus.READY}:
            project.status = ProjectStatus.CALCULATED
        await self._uow.flush()
        return StoredCalculation(run, RunStatus.FRESH)

    async def get(self, calculation_id: UUID) -> StoredCalculation:
        run = await self._repo.run_owned(calculation_id, self._user.id)
        if run is None:
            raise NotFoundError(CALCULATION_NOT_FOUND)
        scenario = await self._scenarios.owned(run.scenario_id)
        project = await self._loader.project(self._user, run.project_id)
        versions = await self._versions.current(project)
        stale = versions.is_stale(run, scenario.version)
        return StoredCalculation(run, RunStatus.STALE if stale else RunStatus.FRESH)

    async def trace(
        self, calculation_id: UUID, section: str | None
    ) -> tuple[UUID, list[dict[str, Any]], int]:
        stored = await self.get(calculation_id)
        items = [item for item in stored.run.trace if section is None or item["section"] == section]
        return stored.run.id, items, int(stored.run.result.get("undocumented_constants", 0))
