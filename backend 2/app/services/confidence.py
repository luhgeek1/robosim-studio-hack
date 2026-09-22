"""Data confidence: weighted share of trusted information across the parameter set."""

from __future__ import annotations

from ..data.parameters import by_key
from ..schemas import ConfidenceReport, ParameterValue


def confidence_report(object_type: str, params: list[ParameterValue], warnings: list[str] | None = None) -> ConfidenceReport:
    defs = by_key(object_type)
    num = den = 0.0
    for p in params:
        w = defs[p.key].weight if p.key in defs else 1.0
        den += w
        if p.source == "confirmed":
            num += w * max(0.7, p.confidence)
        elif p.source in ("assumption", "default"):
            num += w * 0.6 * (0.5 if p.out_of_range else 1.0)
    score = round(100 * num / den) if den else 0
    confirmed = [p for p in params if p.source == "confirmed"]
    assumptions = [p for p in params if p.source in ("assumption", "default")]
    missing = [p for p in params if p.source == "missing"]
    return ConfidenceReport(score=score, recognized=len(confirmed), total=len(params), confirmed=confirmed, assumptions=assumptions, missing=missing, warnings=warnings or [])
