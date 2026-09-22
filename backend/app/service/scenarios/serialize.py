import re
from dataclasses import asdict
from typing import Any

from app.domain.common.provenance import ProvenanceStatus, SourceInfo
from app.engine.calculation import CalculationResult, ItemSizing
from app.engine.calibration import Calibration
from app.engine.economics import Breakdown, CashflowRow
from app.engine.trace import InputKind, Quantity, TraceStep
from app.engine.verdict import Interpretation, Risk
from app.service.scenarios.snapshot import Snapshot

# Numbers that may appear in a formula because they are units or arithmetic, not coefficients (ТЗ 3.5.1).
STRUCTURAL_CONSTANTS = {
    "0": "ноль: начало отсчёта времени или точка безубыточности (NPV = 0)",
    "1": "единица (доля от целого, 1 − доля)",
    "2": "туда и обратно",
    "10": "норматив задан на 10 роботов",
    "12": "месяцев в году",
    "24": "часов в сутках",
    "365": "дней в году",
    "60": "минут в часе",
    "100": "проценты",
    "3600": "секунд в часе",
}
_NUMBER = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)?(?![\w.,])")
_DERIVED = {"status": ProvenanceStatus.DERIVED.value}


def _source(source: SourceInfo | None) -> dict[str, Any] | None:
    if source is None:
        return None
    return {
        "id": str(source.id),
        "kind": source.kind.value,
        "title": source.title,
        "url": source.url,
        "retrieved_at": source.retrieved_at.isoformat() if source.retrieved_at else None,
        "note": source.note,
    }


class Serializer:
    def __init__(self, snapshot: Snapshot) -> None:
        self.snap = snapshot
        self.items = {item.process_key: item for item in snapshot.input.items}

    def provenance(self, quantity: Quantity, namespace: str | None) -> dict[str, Any]:
        if quantity.kind == InputKind.NORM:
            return self._norm(quantity.key)
        if quantity.kind == InputKind.PARAM:
            return self._param(quantity.key)
        if quantity.kind == InputKind.SPEC:
            return self._spec(quantity.key, namespace)
        if quantity.kind == InputKind.LAYOUT:
            return {
                "status": ProvenanceStatus.DERIVED.value,
                "note": f"Кратчайшие пути по графу планировки v{self.snap.layout_version}, "
                "средние по местам хранения",
            }
        return dict(_DERIVED)

    def _norm(self, key: str) -> dict[str, Any]:
        override = self.snap.overrides.get(key)
        if override is not None:
            return {
                "status": ProvenanceStatus.USER.value,
                "note": f"Изменено в сценарии: {override.reason}",
                "changed_by": override.changed_by,
            }
        status = (
            ProvenanceStatus.ASSUMPTION if key in self.snap.assumption_norms else ProvenanceStatus.DEFAULT
        )
        return {"status": status.value, "source": _source(self.snap.norm_source(key))}

    def _param(self, key: str) -> dict[str, Any]:
        provenance = self.snap.param_provenance.get(key)
        if provenance is not None:
            return {
                "status": provenance.status.value,
                "source": _source(provenance.source),
                "note": provenance.note,
            }
        if ".share." in key:
            return {
                "status": ProvenanceStatus.DEFAULT.value,
                "note": "Распределение персонала по процессам — справочник объекта",
            }
        return {"status": ProvenanceStatus.USER.value, "note": "Задано в сценарии"}

    def _spec(self, key: str, namespace: str | None) -> dict[str, Any]:
        if key.endswith(".price_rub"):
            item = self.items.get(key.removesuffix(".price_rub"))
            if item is not None and item.price_overridden:
                return {"status": ProvenanceStatus.USER.value, "note": "Цена задана вручную в сценарии"}
            return {"status": ProvenanceStatus.DEFAULT.value, "note": "Цена каталога организатора, с НДС"}
        status = self.snap.spec_status.get(namespace or "", {}).get(key, ProvenanceStatus.MISSING)
        return {"status": status.value}

    def trace_input(self, quantity: Quantity, namespace: str | None) -> dict[str, Any]:
        return {
            "key": quantity.key,
            "name": quantity.name,
            "value": quantity.value,
            "unit": quantity.unit,
            "kind": quantity.kind.value,
            "provenance": self.provenance(quantity, namespace),
        }

    def _namespace_of(self, step: TraceStep) -> str | None:
        for part in step.key.split("."):
            if part in self.items:
                return part
        return None

    def trace_item(self, step: TraceStep) -> dict[str, Any]:
        namespace = self._namespace_of(step)
        return {
            "metric_key": step.key,
            "name": step.name,
            "value": step.value,
            "unit": step.unit,
            "formula": step.formula,
            "formula_rendered": step.rendered,
            "inputs": [self.trace_input(q, namespace) for q in step.inputs],
            "depends_on": list(step.depends_on),
            "norm_keys": step.norm_keys,
            "section": step.section.value,
        }

    def cost_items(self, breakdown: Breakdown) -> dict[str, Any]:
        return {
            "total_rub": breakdown.total,
            "items": [
                {
                    "key": line.step.key,
                    "name": line.step.name,
                    "amount_rub": line.step.value,
                    "formula": line.step.formula,
                    "formula_rendered": line.step.rendered,
                    "inputs": [self.trace_input(q, self._namespace_of(line.step)) for q in line.step.inputs],
                    "norm_key": next(iter(line.step.norm_keys), None),
                    "note": line.note,
                }
                for line in breakdown.lines
            ],
        }

    def effect_items(self, breakdown: Breakdown) -> dict[str, Any]:
        return {
            "total_rub_year": breakdown.total,
            "items": [
                {
                    "key": line.step.key,
                    "name": line.step.name,
                    "amount_rub_year": line.step.value,
                    "fte_released": line.fte,
                    "formula": line.step.formula,
                    "formula_rendered": line.step.rendered,
                    "inputs": [self.trace_input(q, self._namespace_of(line.step)) for q in line.step.inputs],
                    "kind": line.effect_kind.value if line.effect_kind else None,
                }
                for line in breakdown.lines
            ],
        }

    @staticmethod
    def sizing(item: ItemSizing) -> dict[str, Any]:
        outcome = item.outcome
        claim = item.item.specs.optional("vendor_throughput_per_hour")
        count = item.count
        return {
            "process_key": item.item.process_key,
            "product_id": str(item.item.product_id),
            "product_name": item.item.product_name,
            "demand_peak_per_hour": item.demand_peak_per_hour,
            "demand_avg_per_hour": item.demand_avg_per_hour,
            "robot": {
                "cycle_components": [asdict(c) for c in outcome.cycle_components] if outcome else [],
                "cycle_time_s": outcome.cycle_time_s if outcome else None,
                "nominal_throughput_per_hour": outcome.nominal_per_hour if outcome else None,
                "availability": outcome.availability if outcome else None,
                "utilization_target": outcome.utilization if outcome else None,
                "effective_throughput_per_hour": outcome.effective_per_hour if outcome else None,
                "vendor_claim_per_hour": claim.value if claim else None,
            },
            "count": {
                "analytic": count.analytic,
                "simulated": count.simulated,
                "reserve": count.reserve,
                "final": count.final,
                "source": count.source.value,
                "simulation_id": str(count.simulation_id) if count.simulation_id else None,
                "explanation": count.explanation,
            },
            "stations_count": item.stations,
            "chargers_count": item.chargers,
            "fleet_throughput_per_hour": item.fleet_per_hour,
            "coverage_of_peak": item.coverage,
        }

    @staticmethod
    def cashflow(rows: list[CashflowRow]) -> list[dict[str, Any]]:
        return [
            {
                "period": row.period,
                "capex_rub": row.capex,
                "opex_rub": row.opex,
                "savings_rub": row.savings,
                "financing_rub": row.financing,
                "net_rub": row.net,
                "cumulative_rub": row.cumulative,
                "discounted_cumulative_rub": row.discounted_cumulative,
            }
            for row in rows
        ]

    def norms_used(self, steps: list[TraceStep]) -> list[dict[str, Any]]:
        keys = sorted({q.key for step in steps for q in step.inputs if q.kind == InputKind.NORM})
        result: list[dict[str, Any]] = []
        for key in keys:
            norm = self.snap.norm_rows.get(key)
            if norm is None:
                continue
            value = self.snap.input.norms.value(key)
            has_range = norm.range_min is not None or norm.range_max is not None
            result.append(
                {
                    "key": key,
                    "name": norm.name,
                    "value": value,
                    "unit": norm.unit,
                    "category": norm.category.value,
                    "range": {"min": norm.range_min, "max": norm.range_max} if has_range else None,
                    "source": _source(self.snap.norm_source(key)),
                    "rationale": norm.rationale,
                    "affects": list(norm.affects),
                    "editable_by_user": norm.editable_by_user,
                    "object_types": list(norm.object_types),
                }
            )
        return result


def undocumented_constants(steps: list[TraceStep]) -> int:
    """Numbers written into formulas that are neither inputs with a source nor structural (ТЗ 3.5.1)."""
    return sum(
        1 for step in steps for number in _NUMBER.findall(step.formula) if number not in STRUCTURAL_CONSTANTS
    )


def _calibration(calibrations: list[Calibration]) -> dict[str, Any] | None:
    if not calibrations:
        return None
    primary = calibrations[0]
    return {
        "reference": "; ".join(c.reference for c in calibrations),
        "deviation_pct": primary.deviation_pct,
        "note": " ".join(c.note for c in calibrations),
        "within_tolerance": all(c.within_tolerance for c in calibrations),
        "checks": [
            {
                "key": f"{c.case_key}.{check.key}",
                "name": check.name,
                "ours": check.ours,
                "reference": check.reference,
                "deviation_pct": check.deviation_pct,
                "unit": check.unit,
                "tolerance_pct": c.tolerance_pct,
            }
            for c in calibrations
            for check in c.checks
        ],
    }


def payload(
    result: CalculationResult,
    snapshot: Snapshot,
    interpretation: Interpretation,
    risks: list[Risk],
    calibrations: list[Calibration],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """The stored CalculationRun body (contract shape) and its full trace."""
    serializer = Serializer(snapshot)
    economics = result.economics
    body = {
        "scenario_kind": result.kind.value,
        "sizing": [serializer.sizing(item) for item in result.sizing],
        "capex": serializer.cost_items(economics.capex),
        "opex_year": serializer.cost_items(economics.opex),
        "baseline_cost_year": serializer.cost_items(economics.baseline),
        "scenario_cost_year": serializer.cost_items(economics.scenario_cost),
        "effect_year": serializer.effect_items(economics.effect),
        "cashflow": {
            "monthly": serializer.cashflow(economics.monthly),
            "yearly": serializer.cashflow(economics.yearly),
            "ramp_up_months": economics.ramp_up_months,
        },
        "cashflow_overlay": serializer.cashflow(economics.overlay),
        "metrics": asdict(economics.metrics),
        "interpretation": {
            **asdict(interpretation),
            "verdict": interpretation.verdict.value,
            "band": interpretation.band.value,
        },
        "risks": [{**asdict(risk), "severity": risk.severity.value} for risk in risks],
        "warnings": result.warnings,
        "assumptions_used": serializer.norms_used(result.trace),
        "calibration": _calibration(calibrations),
        "undocumented_constants": undocumented_constants(result.trace),
    }
    return body, [serializer.trace_item(step) for step in result.trace]
