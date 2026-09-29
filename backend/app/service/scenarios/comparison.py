from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.core.errors import ConflictError, ScenarioIncompleteError
from app.db.models import CalculationRun, Scenario
from app.db.repositories.scenarios import ScenarioRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.engine.trace import fmt
from app.engine.verdict import Verdict, mln
from app.service.projects.context import ProjectLoader
from app.service.scenarios.calculations import CalculationService, StoredCalculation
from app.service.scenarios.service import ScenarioService
from app.service.scenarios.state import VersionReader
from app.service.scenarios.views import RunStatus

MIN_SCENARIOS = 3
MAX_CAUSES = 20
PERCENT = 100
COMPARISON_ROWS: tuple[tuple[str, str, str | None, str], ...] = (
    ("capex_rub", "CAPEX", "₽", "lower"),
    ("opex_rub_year", "OPEX роботизации в год", "₽/год", "lower"),
    ("scenario_cost_rub_year", "Затраты в год после внедрения", "₽/год", "lower"),
    ("effect_rub_year", "Чистый годовой эффект", "₽/год", "higher"),
    ("payback_years", "Простой срок окупаемости", "лет", "lower"),
    ("discounted_payback_years", "Дисконтированный срок окупаемости", "лет", "lower"),
    ("roi_pct", "ROI за горизонт", "%", "higher"),
    ("npv_rub", "NPV", "₽", "higher"),
    ("irr_pct", "IRR", "%", "higher"),
    ("tco_rub", "TCO за горизонт", "₽", "lower"),
    ("fte_released", "Высвобождается персонала", "FTE", "higher"),
    ("robots_total", "Роботов", "шт", "none"),
)
DIFF_METRICS = (
    "capex_rub",
    "opex_rub_year",
    "effect_rub_year",
    "payback_years",
    "npv_rub",
    "roi_pct",
    "tco_rub",
)
_GOOD = {Verdict.ATTRACTIVE.value, Verdict.REASONABLE.value}


@dataclass(frozen=True, slots=True)
class ComparedScenario:
    scenario: Scenario
    stored: StoredCalculation


@dataclass(slots=True)
class ComparisonView:
    project_id: UUID
    scenarios: list[ComparedScenario]
    rows: list[dict[str, Any]]
    recommendation: dict[str, Any]
    verdict: dict[str, Any]
    overlay: dict[str, list[dict[str, Any]]]


@dataclass(slots=True)
class RerunView:
    old: CalculationRun
    new: CalculationRun
    diff: list[dict[str, Any]] = field(default_factory=list)


def _best(values: dict[UUID, float | None], better: str) -> UUID | None:
    known = {sid: v for sid, v in values.items() if v is not None}
    if better == "none" or not known:
        return None
    pick = min if better == "lower" else max
    return pick(known, key=lambda sid: known[sid])


class ComparisonService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ScenarioRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._scenarios = ScenarioService(uow, user)
        self._calculations = CalculationService(uow, user)
        self._versions = VersionReader(uow)

    async def compare(self, project_id: UUID, *, recalculate_stale: bool) -> ComparisonView:
        project = await self._loader.project(self._user, project_id)
        await self._scenarios.ensure_baseline(project)
        scenarios = list(await self._repo.for_project(project.id))
        runs = await self._repo.latest_runs([s.id for s in scenarios])
        versions = await self._versions.current(project)
        compared: list[ComparedScenario] = []
        skipped: list[str] = []
        for scenario in scenarios:
            run = runs.get(scenario.id)
            stale = run is not None and versions.is_stale(run, scenario.version)
            if run is None or (stale and recalculate_stale):
                try:
                    compared.append(
                        ComparedScenario(scenario, await self._calculations.calculate(scenario.id))
                    )
                except ScenarioIncompleteError as exc:
                    skipped.append(f"«{scenario.name}» не рассчитан: {exc.detail}")
                continue
            compared.append(
                ComparedScenario(
                    scenario, StoredCalculation(run, RunStatus.STALE if stale else RunStatus.FRESH)
                )
            )
        robotized = [c for c in compared if not c.scenario.is_baseline]
        if not robotized:
            raise ConflictError(
                "Нет рассчитанных сценариев роботизации: создайте сценарий и добавьте решения"
            )
        rows = self._rows(compared)
        recommendation, chosen = self._recommend(compared, skipped)
        for item in compared:
            item.scenario.is_recommended = chosen is not None and item.scenario.id == chosen.scenario.id
        await self._uow.flush()
        verdict = (
            chosen.stored.run.result["interpretation"]
            if chosen
            else robotized[0].stored.run.result["interpretation"]
        )
        overlay = {str(c.scenario.id): c.stored.run.result.get("cashflow_overlay", []) for c in compared}
        return ComparisonView(project.id, compared, rows, recommendation, verdict, overlay)

    @staticmethod
    def _rows(compared: list[ComparedScenario]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for key, name, unit, better in COMPARISON_ROWS:
            values = {c.scenario.id: c.stored.run.result["metrics"].get(key) for c in compared}
            robot_values = {
                sid: v
                for sid, v in values.items()
                if not next(c for c in compared if c.scenario.id == sid).scenario.is_baseline
            }
            best = _best(robot_values, better)
            rows.append(
                {
                    "metric_key": key,
                    "name": name,
                    "unit": unit,
                    "values": {str(sid): value for sid, value in values.items()},
                    "better": better,
                    "best_scenario_id": best,
                }
            )
        return rows

    @staticmethod
    def _recommend(
        compared: list[ComparedScenario], skipped: list[str]
    ) -> tuple[dict[str, Any], ComparedScenario | None]:
        baseline = next((c for c in compared if c.scenario.is_baseline), None)
        good = [c for c in compared if not c.scenario.is_baseline and c.stored.run.verdict in _GOOD]
        caveats = list(skipped)
        if len(compared) < MIN_SCENARIOS:
            caveats.append("ТЗ 3.5.5: для сравнения нужны база и не менее двух сценариев роботизации")
        caveats += [
            f"«{c.scenario.name}» рассчитан на устаревших данных"
            for c in compared
            if c.stored.status == RunStatus.STALE
        ]
        if not good:
            rationale = [
                "Ни один сценарий роботизации не окупается в пределах интервалов ТЗ 3.5.7",
                "Рекомендация — сохранить текущий процесс и пересмотреть охват, продукты или допущения",
            ]
            return {
                "scenario_id": baseline.scenario.id if baseline else None,
                "rationale": rationale,
                "caveats": caveats,
            }, baseline
        best = max(good, key=lambda c: (c.stored.run.npv_rub, -(c.stored.run.payback_years or 0)))
        metrics = best.stored.run.result["metrics"]
        rationale = [
            f"Максимальный NPV среди окупаемых сценариев: {mln(metrics['npv_rub'])} млн ₽",
            f"Окупаемость {fmt(round(metrics['payback_years'], 1))} лет, "
            f"ROI {fmt(round(metrics['roi_pct']))} %",
            f"TCO за {metrics['horizon_years']} лет ниже базы на "
            f"{mln(metrics['tco_baseline_rub'] - metrics['tco_rub'])} млн ₽",
        ]
        high = [r["title"] for r in best.stored.run.result.get("risks", []) if r["severity"] == "high"]
        caveats += [f"Высокий риск: {title}" for title in high]
        return {"scenario_id": best.scenario.id, "rationale": rationale, "caveats": caveats}, best

    async def refresh_recommendation(self, project_id: UUID) -> None:
        """Re-pick the recommended scenario from the stored calculations, so every screen that shows «the»
        result agrees right after a calculation, not only once the comparison screen was opened.

        The flags are set by one statement for the whole project, so concurrent calculations leave exactly
        one scenario recommended; the next calculation or the comparison settles which one."""
        project = await self._loader.project(self._user, project_id)
        scenarios = list(await self._repo.for_project(project_id))
        runs = await self._repo.latest_runs([s.id for s in scenarios])
        versions = await self._versions.current(project)
        compared = [
            ComparedScenario(
                s,
                StoredCalculation(
                    runs[s.id],
                    RunStatus.STALE if versions.is_stale(runs[s.id], s.version) else RunStatus.FRESH,
                ),
            )
            for s in scenarios
            if s.id in runs
        ]
        if not any(not c.scenario.is_baseline for c in compared):
            return
        _, chosen = self._recommend(compared, [])
        await self._repo.set_recommended(project_id, chosen.scenario.id if chosen else None)

    async def rerun(self, calculation_id: UUID) -> RerunView:
        old = (await self._calculations.get(calculation_id)).run
        new = (await self._calculations.calculate(old.scenario_id)).run
        causes = _causes(old, new)
        diff: list[dict[str, Any]] = []
        names = {key: name for key, name, _, _ in COMPARISON_ROWS}
        for key in DIFF_METRICS:
            before, after = old.result["metrics"].get(key), new.result["metrics"].get(key)
            changed = before != after
            delta = (after - before) / abs(before) * PERCENT if before and after is not None else None
            diff.append(
                {
                    "metric_key": key,
                    "name": names[key],
                    "old": before,
                    "new": after,
                    "delta_pct": delta,
                    "causes": causes if changed else [],
                }
            )
        return RerunView(old, new, diff)


def _changes(label: str, old: dict[str, Any], new: dict[str, Any], names: dict[str, str]) -> list[str]:
    return [
        f"{label} «{names.get(key, key)}»: {fmt(old[key])} → {fmt(new[key])}"
        for key in sorted(set(old) & set(new))
        if isinstance(old[key], int | float) and isinstance(new[key], int | float) and old[key] != new[key]
    ]


def _count(item: dict[str, Any]) -> str:
    if item.get("count_mode") == "manual" and item.get("count_manual"):
        return f"вручную {item['count_manual']}"
    if item.get("simulated_robots"):
        return f"по имитации {item['simulated_robots']}"
    return "по формуле цикла"


def _item_causes(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """What changed inside one process: price, the source of N (formula, fleet sweep, by hand), throughput."""
    name = after["product_name"]
    causes: list[str] = []
    if before["price"] != after["price"]:
        causes.append(f"Цена «{name}»: {mln(before['price'])} → {mln(after['price'])} млн ₽")
    if _count(before) != _count(after):
        causes.append(f"Число роботов «{name}»: {_count(before)} → {_count(after)}")
    if before.get("throughput_override") != after.get("throughput_override"):
        causes.append(
            f"Производительность «{name}» задана вручную: {after.get('throughput_override') or 'нет'}"
        )
    return causes


def _causes(old: CalculationRun, new: CalculationRun) -> list[str]:
    causes: list[str] = []
    for attr, label in (
        ("catalog_version", "Каталог"),
        ("norm_set_version", "Нормативы"),
        ("engine_version", "Расчётная модель"),
        ("project_version", "Параметры проекта, версия"),
    ):
        if getattr(old, attr) != getattr(new, attr):
            causes.append(f"{label}: {getattr(old, attr)} → {getattr(new, attr)}")
    old_items = {i["process_key"]: i for i in old.inputs.get("items", [])}
    new_items = {i["process_key"]: i for i in new.inputs.get("items", [])}
    for key in sorted(set(old_items) | set(new_items)):
        before, after = old_items.get(key), new_items.get(key)
        if before is None or after is None or before["product_id"] != after["product_id"]:
            causes.append(f"Изменён состав решений: {key}")
        else:
            causes += _item_causes(before, after)
    for attr, label in (("horizon_years", "Горизонт, лет"), ("discount_rate", "Ставка дисконтирования")):
        before_value, after_value = old.inputs.get(attr), new.inputs.get(attr)
        if before_value is not None and after_value is not None and before_value != after_value:
            causes.append(f"{label}: {fmt(before_value)} → {fmt(after_value)}")
    if old.inputs.get("financing") != new.inputs.get("financing"):
        causes.append("Изменены условия финансирования")
    causes += _changes(
        "Норматив", old.inputs.get("norms", {}), new.inputs.get("norms", {}), new.inputs.get("norm_names", {})
    )
    causes += _changes(
        "Параметр",
        old.inputs.get("params", {}),
        new.inputs.get("params", {}),
        new.inputs.get("param_names", {}),
    )
    return causes[:MAX_CAUSES]
