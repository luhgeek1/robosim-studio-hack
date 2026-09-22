from dataclasses import dataclass, field, replace
from uuid import UUID

from app.core.errors import ConflictError, InvalidInputError, ScenarioIncompleteError
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.common.provenance import ProvenanceStatus
from app.engine.calculation import CalculationError
from app.engine.sensitivity import (
    GROUP_NAMES,
    Driver,
    DriverKind,
    Group,
    Heatmap,
    MonteCarloOutcome,
    TornadoItem,
    heatmap,
    monte_carlo,
    norm_driver,
    percent_driver,
    tornado,
)
from app.engine.trace import InputKind
from app.service.scenarios.calculations import CalculationService, Evaluation
from app.service.scenarios.snapshot import Snapshot

DEFAULT_SWING_PCT = 20.0
SURVEY_LIMIT = 10
SURVEY_METRIC = "npv_rub"
_UNVERIFIED = frozenset({ProvenanceStatus.DEFAULT, ProvenanceStatus.ASSUMPTION, ProvenanceStatus.MISSING})
_DEFAULT_NORMS = (
    "amr_utilization_target",
    "effective_speed_factor",
    "service_share_of_hardware_per_year",
    "commissioning_share_of_hardware",
    "wage_indexation_rate",
)
_RATE_NORMS = ("discount_rate",)
_RATE_METRICS = frozenset({"npv_rub"})


@dataclass(frozen=True, slots=True)
class DriverRequest:
    key: str
    low: float | None = None
    high: float | None = None
    low_pct: float | None = None
    high_pct: float | None = None
    mode: float | None = None
    dist: str = "triangular"


@dataclass(frozen=True, slots=True)
class SensitivityView:
    metric: str
    base_value: float | None
    items: list[TornadoItem]
    heatmap: Heatmap | None = None


@dataclass(frozen=True, slots=True)
class SurveyItem:
    driver: Driver
    swing: float
    rank: int
    current_value: float
    recommendation: str
    how_to_measure: str | None


@dataclass(frozen=True, slots=True)
class SurveyView:
    items: list[SurveyItem] = field(default_factory=list)


def _norm_range(snapshot: Snapshot, key: str) -> tuple[float | None, float | None]:
    norm = snapshot.norm_rows.get(key)
    return (norm.range_min, norm.range_max) if norm else (None, None)


def _used_keys(evaluation: Evaluation, kind: InputKind) -> set[str]:
    return {q.key for step in evaluation.result.trace for q in step.inputs if q.kind == kind}


class Drivers:
    """Resolves driver keys to low/high values: norms use their documented range, the rest ±20 % of base."""

    def __init__(self, evaluation: Evaluation) -> None:
        self.evaluation = evaluation
        self.snapshot = evaluation.snapshot
        self.used_norms = _used_keys(evaluation, InputKind.NORM)

    def group(self, group: Group, low_pct: float, high_pct: float) -> Driver:
        return percent_driver(group.value, GROUP_NAMES[group], DriverKind.GROUP, None, 1.0, low_pct, high_pct)

    def norm(self, key: str, low: float | None = None, high: float | None = None) -> Driver:
        quantity = self.snapshot.input.norms.get(key)
        range_low, range_high = _norm_range(self.snapshot, key)
        status = "assumption" if key in self.snapshot.assumption_norms else "default"
        return norm_driver(
            quantity, low if low is not None else range_low, high if high is not None else range_high, status
        )

    def param(self, key: str, low_pct: float, high_pct: float) -> Driver:
        value = self.snapshot.input.params.get(key)
        meta = self.snapshot.input.param_meta.get(key)
        if value is None or meta is None:
            raise InvalidInputError(f"Параметр {key} не задан в проекте — его нельзя варьировать")
        driver = percent_driver(key, meta.name, DriverKind.PARAM, meta.unit, value, low_pct, high_pct)
        return replace(driver, status=meta.status.value)

    def resolve(self, request: DriverRequest) -> Driver:
        low_pct = request.low_pct if request.low_pct is not None else -DEFAULT_SWING_PCT
        high_pct = request.high_pct if request.high_pct is not None else DEFAULT_SWING_PCT
        if request.key in Group.__members__.values():
            driver = self.group(Group(request.key), low_pct, high_pct)
            if request.key == Group.EQUIPMENT_PRICE:
                driver = replace(driver, kind=DriverKind.CATALOG)
        elif request.key in self.snapshot.input.norms.items:
            driver = self.norm(request.key)
            if request.low_pct is not None or request.high_pct is not None:
                driver = percent_driver(
                    driver.key, driver.name, DriverKind.NORM, driver.unit, driver.base, low_pct, high_pct
                )
        else:
            driver = self.param(request.key, low_pct, high_pct)
        mode = request.mode if request.mode is not None and driver.kind != DriverKind.GROUP else driver.base
        return replace(
            driver,
            base=mode,
            low=request.low if request.low is not None else driver.low,
            high=request.high if request.high is not None else driver.high,
            dist=request.dist,
        )

    def defaults(self, metric: str) -> list[Driver]:
        """ТЗ 3.5.6: equipment price, operations volume, labor cost and the norms the result depends on."""
        drivers: list[Driver] = []
        if self.snapshot.input.items:
            drivers.append(
                replace(
                    self.group(Group.EQUIPMENT_PRICE, -DEFAULT_SWING_PCT, DEFAULT_SWING_PCT),
                    kind=DriverKind.CATALOG,
                )
            )
            drivers.append(self.group(Group.OPERATIONS_VOLUME, -DEFAULT_SWING_PCT, DEFAULT_SWING_PCT))
        drivers.append(self.group(Group.LABOR_COST, -DEFAULT_SWING_PCT, DEFAULT_SWING_PCT))
        keys = [*_DEFAULT_NORMS, *sorted(k for k in self.used_norms if k.startswith("labor_release_share"))]
        if metric in _RATE_METRICS:
            keys += list(_RATE_NORMS)
        for key in keys:
            if key in self.used_norms or key in _RATE_NORMS:
                driver = self.norm(key)
                if driver.low != driver.high:
                    drivers.append(driver)
        return drivers


class AnalysisService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._calculations = CalculationService(uow, user)

    async def _evaluation(self, scenario_id: UUID) -> Evaluation:
        evaluation = await self._calculations.evaluate(scenario_id)
        if not evaluation.snapshot.input.items:
            raise ConflictError("Для базового сценария чувствительность не считается: в нём нет роботизации")
        return evaluation

    async def sensitivity(
        self,
        scenario_id: UUID,
        metric: str,
        requests: list[DriverRequest],
        heat: tuple[str, str, int] | None,
    ) -> SensitivityView:
        evaluation = await self._evaluation(scenario_id)
        resolver = Drivers(evaluation)
        drivers = [resolver.resolve(r) for r in requests] if requests else resolver.defaults(metric)
        base, items = tornado(evaluation.snapshot.input, drivers, metric)
        grid = None
        if heat is not None:
            x_key, y_key, steps = heat
            grid = heatmap(
                evaluation.snapshot.input,
                resolver.resolve(DriverRequest(x_key)),
                resolver.resolve(DriverRequest(y_key)),
                steps,
                metric,
            )
        return SensitivityView(metric, base, items, grid)

    async def monte_carlo(
        self,
        scenario_id: UUID,
        *,
        n: int | None,
        metric: str,
        requests: list[DriverRequest],
        seed: int | None,
    ) -> MonteCarloOutcome:
        evaluation = await self._evaluation(scenario_id)
        resolver = Drivers(evaluation)
        drivers = [resolver.resolve(r) for r in requests] if requests else resolver.defaults(metric)
        norms = evaluation.snapshot.input.norms
        thresholds = {
            key: norms.value(key)
            for key in ("verdict_payback_attractive_years", "verdict_payback_reasonable_years")
        }
        runs = n or int(norms.value("monte_carlo_runs"))
        try:
            return monte_carlo(
                evaluation.snapshot.input, drivers, n=runs, metric=metric, seed=seed, thresholds=thresholds
            )
        except CalculationError as exc:
            raise ScenarioIncompleteError(str(exc)) from exc

    async def survey(self, scenario_id: UUID) -> SurveyView:
        """ТЗ 3.7.5: inputs that move the result most and are still defaults or team assumptions."""
        evaluation = await self._evaluation(scenario_id)
        resolver = Drivers(evaluation)
        snapshot = evaluation.snapshot
        drivers: list[Driver] = []
        for key in sorted(_used_keys(evaluation, InputKind.PARAM)):
            meta = snapshot.input.param_meta.get(key)
            if meta is not None and meta.status in _UNVERIFIED and snapshot.input.params.get(key):
                drivers.append(resolver.param(key, -DEFAULT_SWING_PCT, DEFAULT_SWING_PCT))
        for key in sorted(resolver.used_norms & snapshot.assumption_norms):
            driver = resolver.norm(key)
            if driver.low != driver.high:
                drivers.append(driver)
        _, items = tornado(snapshot.input, drivers, SURVEY_METRIC)
        survey = [
            SurveyItem(
                driver=item.driver,
                swing=item.swing,
                rank=item.rank,
                current_value=item.driver.base,
                recommendation=_recommendation(item.driver, snapshot),
                how_to_measure=snapshot.survey_hints.get(item.driver.key),
            )
            for item in items
            if item.swing > 0
        ]
        return SurveyView(survey[:SURVEY_LIMIT])


def _recommendation(driver: Driver, snapshot: Snapshot) -> str:
    if driver.kind == DriverKind.NORM:
        norm = snapshot.norm_rows.get(driver.key)
        rationale = (norm.rationale or "").split(". ")[0] if norm else ""
        return (
            f"Проверить на пилоте или у вендора «{driver.name}»: сейчас допущение команды "
            f"({driver.base:g} {driver.unit or ''}, диапазон {driver.low:g}–{driver.high:g}). "
            f"{rationale}".strip()
        )
    status = "значение по умолчанию из демо-набора" if driver.status == "default" else "допущение"
    return f"Заменить замером «{driver.name}»: сейчас {status} {driver.base:g} {driver.unit or ''}".strip()
