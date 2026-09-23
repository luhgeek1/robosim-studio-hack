from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum

from app.domain.common.provenance import ProvenanceStatus
from app.domain.scenario.models import CountSource, ScenarioKind
from app.engine.calculation import CalculationResult
from app.engine.economics import Metrics
from app.engine.trace import Book, fmt

MLN = 1_000_000
PERCENT = 100
SECONDS_PER_MINUTE = 60
# A vendor claim this many times above the cycle-based throughput is flagged («паспорт против физики»).
VENDOR_CLAIM_GAP = 3
_UNVERIFIED = frozenset({ProvenanceStatus.DEFAULT, ProvenanceStatus.ASSUMPTION, ProvenanceStatus.MISSING})


class Verdict(StrEnum):
    ATTRACTIVE = "attractive"
    REASONABLE = "reasonable"
    QUESTIONABLE = "questionable"
    NOT_RECOMMENDED = "not_recommended"
    INSUFFICIENT_DATA = "insufficient_data"
    BASELINE = "baseline"


class Band(StrEnum):
    LT3 = "lt3"
    FROM3TO5 = "from3to5"
    GT5 = "gt5"
    NEVER = "never"
    NONE = "none"


class RiskSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


VERDICT_LABELS = {
    Verdict.ATTRACTIVE: "привлекательно",
    Verdict.REASONABLE: "обоснованно",
    Verdict.QUESTIONABLE: "сомнительно",
    Verdict.NOT_RECOMMENDED: "нецелесообразно",
    Verdict.INSUFFICIENT_DATA: "недостаточно данных",
    Verdict.BASELINE: "точка отсчёта",
}


@dataclass(frozen=True, slots=True)
class Interpretation:
    verdict: Verdict
    band: Band
    headline: str
    summary: str
    key_drivers: list[str] = field(default_factory=list)
    caveats: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class Risk:
    code: str
    title: str
    severity: RiskSeverity
    description: str
    mitigation: str | None = None
    related_params: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class VerdictContext:
    norms: Book
    budget_rub: float | None
    param_status: Mapping[str, ProvenanceStatus]
    assumption_norms: frozenset[str]
    # Power the object can give to robot chargers, kW (datasets: warehouse 500, airport 300, hospital 80).
    charging_power_kw: float | None = None
    # Delivery norms of the object by process, minutes: a robot trip longer than the norm cannot meet it.
    lead_targets: Mapping[str, float] = field(default_factory=dict)


def mln(value: float) -> str:
    return fmt(round(value / MLN, 1))


def _years(value: float) -> str:
    return f"{fmt(round(value, 1))} {'года' if 1 < round(value, 1) < 5 else 'лет'}"


def _band(payback: float | None, attractive: float, reasonable: float) -> Band:
    if payback is None:
        return Band.NEVER
    if payback < attractive:
        return Band.LT3
    return Band.FROM3TO5 if payback <= reasonable else Band.GT5


def _verdict(metrics: Metrics, norms: Book) -> Verdict:
    payback = metrics.payback_years
    if payback is None or payback > metrics.horizon_years:
        return Verdict.NOT_RECOMMENDED
    if payback < norms.value("verdict_payback_attractive_years") and metrics.npv_rub > 0:
        return Verdict.ATTRACTIVE
    if payback <= norms.value("verdict_payback_reasonable_years"):
        return Verdict.REASONABLE if metrics.npv_rub >= 0 else Verdict.QUESTIONABLE
    if payback <= norms.value("verdict_payback_questionable_years"):
        return Verdict.QUESTIONABLE
    return Verdict.NOT_RECOMMENDED


def _scope(result: CalculationResult) -> str:
    names = [f"«{s.process_name.split(' (')[0].lower()}»" for s in result.sizing]
    return "Роботизация " + ", ".join(names) if names else "Сценарий"


def _drivers(result: CalculationResult) -> list[str]:
    economics = result.economics
    drivers: list[str] = []
    savings = sorted(
        (line for line in economics.effect.lines if line.step.value > 0), key=lambda line: -line.step.value
    )
    for line in savings[:2]:
        drivers.append(
            f"{line.step.name}: {mln(line.step.value)} млн ₽/год, {fmt(round(line.fte or 0, 1))} FTE"
        )
    if economics.capex.total > 0:
        top = max(economics.capex.lines, key=lambda line: line.step.value)
        share = top.step.value / economics.capex.total * PERCENT
        drivers.append(f"Крупнейшая статья CAPEX — {top.step.name.lower()}: {fmt(round(share))} %")
    saved = sum(line.step.value for line in savings)
    if saved > 0 and economics.opex.total > 0:
        drivers.append(
            f"OPEX роботизации забирает {fmt(round(economics.opex.total / saved * PERCENT))} % экономии ФОТ"
        )
    return drivers


def _caveats(result: CalculationResult, ctx: VerdictContext) -> list[str]:
    caveats: list[str] = []
    vat = ctx.norms.optional("vat_rate")
    if vat is not None:
        caveats.append(
            "Все суммы с НДС (единая база, Q&A 16.09). Если НДС принимается к вычету, CAPEX и OPEX ниже на "
            f"{fmt(round(vat.value / (1 + vat.value) * PERCENT, 1))} %"
        )
    if any(s.count.source == CountSource.ANALYTIC for s in result.sizing):
        caveats.append("Число роботов — аналитическая оценка по времени цикла; имитация уточнит N и резерв")
    used = {q.key: q.name for step in result.trace for q in step.inputs}
    assumed = sorted(name for key, name in used.items() if key in ctx.assumption_norms)
    if assumed:
        caveats.append(
            f"Результат опирается на {len(assumed)} допущений команды (с обоснованием в реестре нормативов), "
            f"например: {', '.join(assumed[:3]).lower()}"
        )
    wage = ctx.norms.optional("wage_indexation_rate")
    if wage is not None and result.kind != ScenarioKind.BASELINE:
        caveats.append(f"Экономия растёт с индексацией зарплат {fmt(round(wage.value * PERCENT, 1))} % в год")
    return caveats


def interpret(result: CalculationResult, ctx: VerdictContext) -> Interpretation:
    """ТЗ 3.5.7: a number, the band it falls into, risks and a plain-language interpretation."""
    metrics = result.economics.metrics
    horizon = metrics.horizon_years
    if result.kind == ScenarioKind.BASELINE:
        return Interpretation(
            verdict=Verdict.BASELINE,
            band=Band.NONE,
            headline=f"Как сейчас: {mln(metrics.baseline_cost_rub_year)} млн ₽ ФОТ в год, "
            f"{mln(metrics.tco_baseline_rub)} млн ₽ за {horizon} лет с индексацией",
            summary="Без роботизации — точка отсчёта для эффекта, окупаемости и TCO остальных сценариев.",
            caveats=_caveats(result, ctx),
        )
    verdict = _verdict(metrics, ctx.norms)
    band = _band(
        metrics.payback_years,
        ctx.norms.value("verdict_payback_attractive_years"),
        ctx.norms.value("verdict_payback_reasonable_years"),
    )
    scope = _scope(result)
    if metrics.payback_years is None or metrics.payback_years > horizon:
        headline = f"{scope} не окупается за горизонт {horizon} лет — {VERDICT_LABELS[verdict]}"
    else:
        headline = f"{scope} окупается за {_years(metrics.payback_years)} — {VERDICT_LABELS[verdict]}"
    irr = f", IRR {fmt(round(metrics.irr_pct, 1))} %" if metrics.irr_pct is not None else ""
    discounted = (
        f", дисконтированная окупаемость {_years(metrics.discounted_payback_years)}"
        if metrics.discounted_payback_years is not None
        else ", дисконтированная окупаемость за горизонтом"
    )
    summary = (
        f"CAPEX {mln(metrics.capex_rub)} млн ₽, OPEX роботизации {mln(metrics.opex_rub_year)} млн ₽/год, "
        f"чистый эффект {mln(metrics.effect_rub_year)} млн ₽/год. "
        f"NPV {mln(metrics.npv_rub)} млн ₽ при ставке {fmt(round(metrics.discount_rate_pct, 1))} %"
        f"{irr}{discounted}. ROI за {horizon} лет {fmt(round(metrics.roi_pct))} %; "
        f"TCO {mln(metrics.tco_rub)} против {mln(metrics.tco_baseline_rub)} млн ₽. "
        f"Роботов {metrics.robots_total}, высвобождается {fmt(round(metrics.fte_released, 1))} FTE."
    )
    return Interpretation(verdict, band, headline, summary, _drivers(result), _caveats(result, ctx))


def assess_risks(result: CalculationResult, ctx: VerdictContext) -> list[Risk]:
    if result.kind == ScenarioKind.BASELINE:
        return []
    metrics = result.economics.metrics
    risks: list[Risk] = []
    if ctx.budget_rub is not None and metrics.capex_rub > ctx.budget_rub:
        risks.append(
            Risk(
                "BUDGET_EXCEEDED",
                "CAPEX выше бюджета",
                RiskSeverity.HIGH,
                f"CAPEX {mln(metrics.capex_rub)} млн ₽ при бюджете {mln(ctx.budget_rub)} млн ₽",
                "Поэтапное внедрение, RaaS или лизинг; сократить охват процессов",
                ["capex_budget_mln_rub"],
            )
        )
    if metrics.effect_rub_year <= 0:
        risks.append(
            Risk(
                "NEGATIVE_EFFECT",
                "Эффект не покрывает OPEX",
                RiskSeverity.HIGH,
                f"Чистый годовой эффект {mln(metrics.effect_rub_year)} млн ₽: "
                "OPEX роботизации больше экономии ФОТ",
                "Проверить охват процесса и долю высвобождения; сравнить с RaaS",
            )
        )
    life = ctx.norms.optional("robot_service_life_years")
    if life is not None and metrics.payback_years is not None and metrics.payback_years > life.value:
        risks.append(
            Risk(
                "PAYBACK_BEYOND_LIFE",
                "Окупаемость дольше срока службы",
                RiskSeverity.HIGH,
                f"Окупаемость {_years(metrics.payback_years)} при сроке службы {_years(life.value)}",
                "Рассмотреть RaaS или другой продукт",
            )
        )
    if metrics.payback_years is not None and metrics.npv_rub < 0:
        risks.append(
            Risk(
                "NPV_NEGATIVE",
                "NPV отрицательный",
                RiskSeverity.MEDIUM,
                f"С учётом стоимости денег ({fmt(round(metrics.discount_rate_pct, 1))} %) проект теряет "
                f"{mln(-metrics.npv_rub)} млн ₽ за горизонт",
                "Проверить ставку дисконтирования и горизонт; льготное финансирование",
                ["discount_rate"],
            )
        )
    risks += _item_risks(result)
    risks += _power_risks(result, ctx)
    risks += _lead_time_risks(result, ctx)
    return risks


def _lead_time_risks(result: CalculationResult, ctx: VerdictContext) -> list[Risk]:
    risks: list[Risk] = []
    for sizing in result.sizing:
        target = ctx.lead_targets.get(sizing.item.process_key)
        cycle = sizing.outcome.cycle_time_s if sizing.outcome else None
        if target is None or cycle is None or cycle <= target * SECONDS_PER_MINUTE:
            continue
        risks.append(
            Risk(
                "LEAD_TIME_EXCEEDED",
                f"Рейс дольше норматива: {sizing.process_name}",
                RiskSeverity.HIGH,
                f"Один рейс робота — {fmt(round(cycle / SECONDS_PER_MINUTE, 1))} мин при нормативе "
                f"{fmt(target)} мин; ожидание в очереди добавит ещё",
                "Проверить маршрут и лифты; взять более быстрый робот или оставить срочные заявки людям",
            )
        )
    return risks


def _power_risks(result: CalculationResult, ctx: VerdictContext) -> list[Risk]:
    per_station = ctx.norms.optional("charger_power_kw")
    chargers = sum(sizing.chargers for sizing in result.sizing)
    if ctx.charging_power_kw is None or per_station is None or not chargers:
        return []
    needed = chargers * per_station.value
    if needed <= ctx.charging_power_kw:
        return []
    return [
        Risk(
            "CHARGING_POWER",
            "Не хватит мощности на зарядку",
            RiskSeverity.HIGH,
            f"{chargers} зарядных станций × {fmt(per_station.value)} кВт = {fmt(round(needed))} кВт "
            f"при доступных {fmt(ctx.charging_power_kw)} кВт",
            "Заложить усиление электроснабжения или зарядку по графику; уточнить мощность станций у вендора",
            ["charging_power_kw", "power_kw", "charger_power_kw"],
        )
    ]


def _item_risks(result: CalculationResult) -> list[Risk]:
    risks: list[Risk] = []
    for sizing in result.sizing:
        item, name = sizing.item, sizing.process_name
        if sizing.coverage < 1:
            risks.append(
                Risk(
                    "UNDER_CAPACITY",
                    f"Парк не закрывает пик: {name}",
                    RiskSeverity.HIGH,
                    f"Роботы закрывают {fmt(round(sizing.coverage * PERCENT))} % пикового спроса; "
                    "остальное — вручную",
                    f"Увеличить парк до расчётных {sizing.count.analytic + sizing.count.reserve} шт.",
                )
            )
        if item.candidate_status in {"excluded", "manual"}:
            risks.append(
                Risk(
                    "PRODUCT_EXCLUDED",
                    f"Продукт не прошёл подбор: {item.product_name}",
                    RiskSeverity.HIGH,
                    "Продукт добавлен вручную или не проходит жёсткие проверки совместимости с объектом",
                    "Проверить причины исключения в подборе",
                )
            )
        elif item.candidate_status == "check":
            risks.append(
                Risk(
                    "PRODUCT_UNVERIFIED",
                    f"Нужна проверка ТТХ: {item.product_name}",
                    RiskSeverity.MEDIUM,
                    "По ключевым ограничениям нет подтверждённых данных производителя",
                    "Запросить у вендора недостающие характеристики",
                )
            )
        if sizing.count.source == CountSource.ANALYTIC and sizing.outcome is not None:
            risks.append(
                Risk(
                    "NOT_SIMULATED",
                    f"Число роботов не проверено имитацией: {name}",
                    RiskSeverity.MEDIUM,
                    sizing.count.explanation,
                    "Запустить имитацию: она проверит заторы, зарядку и SLA и уточнит N",
                )
            )
        if item.throughput_override:
            risks.append(
                Risk(
                    "MANUAL_THROUGHPUT",
                    f"Производительность задана вручную: {name}",
                    RiskSeverity.MEDIUM,
                    f"{fmt(item.throughput_override)} ед/ч вместо расчёта по циклу на маршруте",
                    "Сравнить с расчётом по циклу и имитацией",
                )
            )
        claim = item.specs.optional("vendor_throughput_per_hour")
        outcome = sizing.outcome
        if (
            claim
            and outcome
            and outcome.effective_per_hour
            and claim.value > VENDOR_CLAIM_GAP * outcome.effective_per_hour
        ):
            risks.append(
                Risk(
                    "PASSPORT_VS_PHYSICS",
                    f"Паспорт против физики: {item.product_name}",
                    RiskSeverity.LOW,
                    f"Производитель заявляет {fmt(claim.value)} ед/ч, цикл на маршруте объекта даёт "
                    f"{fmt(round(outcome.effective_per_hour, 1))} ед/ч — расчёт по паспорту занизил бы парк",
                    "Расчёт уже ведётся по времени цикла; уточнить маршрут планировкой",
                )
            )
    return risks


def unverified_inputs(result: CalculationResult, ctx: VerdictContext) -> list[str]:
    """Object parameters the result depends on that are still defaults or assumptions."""
    used = {q.key for step in result.trace for q in step.inputs}
    return sorted(key for key in used if ctx.param_status.get(key) in _UNVERIFIED)
