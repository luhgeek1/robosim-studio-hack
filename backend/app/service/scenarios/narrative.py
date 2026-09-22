from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.db.models import CalculationRun

GENERATED_BY_RULES = "rules"
_GOOD = {"attractive", "reasonable"}
_SHOWN_SEVERITIES = {"high", "medium"}


@dataclass(frozen=True, slots=True)
class NarrativeView:
    executive_summary: str
    key_findings: list[str]
    next_steps: list[str]
    risks_text: list[str] = field(default_factory=list)
    generated_by: str = GENERATED_BY_RULES
    generated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def _next_steps(result: dict[str, Any]) -> list[str]:
    codes = {risk["code"] for risk in result.get("risks", [])}
    verdict = result["interpretation"]["verdict"]
    steps: list[str] = []
    if "NOT_SIMULATED" in codes:
        steps.append(
            "Запустить имитацию: она проверит заторы, зарядку и SLA и уточнит число роботов и резерв"
        )
    if any("длина маршрута по нормативу" in w for w in result.get("warnings", [])):
        steps.append("Сгенерировать планировку объекта: длина маршрутов сейчас взята по нормативу")
    if codes & {"PRODUCT_UNVERIFIED", "PRODUCT_EXCLUDED"}:
        steps.append("Запросить у вендоров недостающие ТТХ по ключевым ограничениям объекта")
    if "BUDGET_EXCEEDED" in codes:
        steps.append("Рассмотреть поэтапное внедрение, лизинг или RaaS: CAPEX выше бюджета")
    if verdict in _GOOD:
        steps.append("Запросить коммерческие предложения и согласовать пилот на одной зоне или смене")
    elif verdict != "baseline":
        steps.append("Пересмотреть охват: начать с процесса с наибольшей долей ФОТ и сравнить с RaaS")
    steps.append("Уточнить при обследовании параметры-допущения из списка «Что уточнить при обследовании»")
    return steps


def narrative(run: CalculationRun) -> NarrativeView:
    """Executive summary from the stored calculation; deterministic, works without any LLM (D-008)."""
    result = run.result
    interpretation = result["interpretation"]
    findings = list(interpretation.get("key_drivers", []))
    findings += [f"{s['product_name']}: {s['count']['explanation']}" for s in result.get("sizing", [])]
    calibration = result.get("calibration")
    if calibration and calibration.get("note"):
        findings.append(f"Сверка с методикой ФЦ БАС: {calibration['note']}")
    risks = [
        f"{risk['title']}: {risk['description']}"
        for risk in result.get("risks", [])
        if risk["severity"] in _SHOWN_SEVERITIES
    ]
    return NarrativeView(
        executive_summary=f"{interpretation['headline']}. {interpretation['summary']}",
        key_findings=findings,
        next_steps=_next_steps(result),
        risks_text=risks,
    )
