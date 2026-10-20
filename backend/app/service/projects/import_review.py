from dataclasses import replace
from typing import Any

from app.domain.common.provenance import ProvenanceStatus
from app.domain.project.models import EffectiveParam
from app.domain.project.params import validate_value
from app.infra.importers.models import ImportRow
from app.service.projects.context import ProjectContext
from app.service.projects.import_values import check_value, issue


def initial_rows(rows: list[ImportRow]) -> list[dict[str, Any]]:
    return [
        {
            "row_id": str(index),
            "key": row.key,
            "raw_field": row.raw_field,
            "raw_value": row.raw_value,
            "raw_unit": row.unit,
            "value": row.raw_value,
            "unit": row.unit,
            "location": row.location,
            "confidence": row.confidence,
            "suggestion_key": row.suggestion_key,
            "excluded": False,
        }
        for index, row in enumerate(rows, 1)
    ]


def review_rows(context: ProjectContext, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    reviewed = []
    by_key = context.by_key
    for original in rows:
        row = {**original, "issues": [], "suggestion": None, "conflict_with_current": None}
        param = by_key.get(row.get("key") or "")
        row["name"] = param.definition.name if param else row["raw_field"]
        if param is None:
            row["issues"] = [
                issue(
                    "UNKNOWN_FIELD",
                    "Поле не сопоставлено с параметром объекта",
                    "Выберите параметр или исключите строку",
                )
            ]
            if row.get("suggestion_key") in by_key:
                row["suggestion"] = {
                    "key": row["suggestion_key"],
                    "value": row["value"],
                    "unit": row["unit"],
                    "message": f"Сопоставить с «{by_key[row['suggestion_key']].definition.name}»",
                }
        else:
            row.update(check_value(param.definition, row["value"], row.get("unit")))
            row["status"] = ProvenanceStatus.IMPORTED.value
            if row["confidence"] < 1:
                row["issues"].append(
                    issue(
                        "FUZZY_MATCH",
                        "Название сопоставлено приблизительно",
                        "Проверьте выбранный параметр",
                        "warning",
                    )
                )
            if param.value != row["value"] and param.provenance.status in {
                ProvenanceStatus.USER,
                ProvenanceStatus.IMPORTED,
                ProvenanceStatus.CONFIRMED,
            }:
                row["conflict_with_current"] = {
                    "current_value": param.value,
                    "current_status": param.provenance.status.value,
                }
        reviewed.append(row)
    duplicates: dict[str, list[dict[str, Any]]] = {}
    for row in reviewed:
        if row.get("key") and not row["excluded"]:
            duplicates.setdefault(row["key"], []).append(row)
    for group in duplicates.values():
        if len(group) < 2:
            continue
        for row in group:
            row["issues"].append(
                issue(
                    "DUPLICATE",
                    "Несколько строк задают один параметр",
                    "Оставьте одну строку, остальные исключите",
                )
            )
    return reviewed


def is_ready(row: dict[str, Any]) -> bool:
    return (
        not row.get("excluded")
        and bool(row.get("key"))
        and not any(i["severity"] == "error" for i in row.get("issues", []))
    )


def preview_context(context: ProjectContext, rows: list[dict[str, Any]], overwrite: bool) -> ProjectContext:
    updates = {row["key"]: row for row in rows if is_ready(row)}
    params: list[EffectiveParam] = []
    for param in context.params:
        row = updates.get(param.key)
        if row is None or (not overwrite and param.provenance.status == ProvenanceStatus.USER):
            params.append(param)
        else:
            params.append(
                replace(
                    param,
                    value=row["value"],
                    unit=row["unit"],
                    validation=validate_value(param.definition, row["value"]),
                )
            )
    return replace(context, params=params)


def stored_rows(mapped: list[dict[str, Any]], unmapped: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [dict(row) for row in [*mapped, *unmapped] if "row_id" in row]
    return sorted(rows, key=lambda row: int(row["row_id"]))
