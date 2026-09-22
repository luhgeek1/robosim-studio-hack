from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import DomainError, ParamsInvalidError
from app.core.parsing import parse_scalar
from app.db.models import ParamHistory, Project, ProjectParam
from app.db.repositories.projects import ProjectRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.common.provenance import ProvenanceStatus, Scalar
from app.domain.common.units import UnitMismatchError, convert
from app.domain.project.models import (
    Blocks,
    DataQualityItem,
    DataQualitySummary,
    EffectiveParam,
    ParamHistoryEntry,
    Severity,
    ValidationIssue,
    ValidationReport,
    ValidationState,
)
from app.domain.project.params import build_report, data_quality, field_issues, validate_value
from app.domain.reference import CrossCheck, ParameterDef
from app.engine.expressions import MissingValueError, parse
from app.service.projects.audit import AuditLog
from app.service.projects.context import ProjectContext, ProjectLoader

HISTORY_LIMIT = 100


@dataclass(frozen=True, slots=True)
class ParamChange:
    key: str
    value: Scalar
    unit: str | None = None
    note: str | None = None
    raw_value: str | None = None
    confidence: float | None = None


def coerce(definition: ParameterDef, change: ParamChange) -> Scalar:
    """Form and file values to the parameter type and base unit; raises DomainError with a readable reason."""
    value = change.value
    if isinstance(value, str) and definition.type in {"number", "integer", "boolean"}:
        value = parse_scalar(value)
    if definition.type == "enum" and isinstance(value, str):
        labels = {item["label"].strip().lower(): item["value"] for item in definition.enum_values}
        value = labels.get(value.strip().lower(), value)
    if isinstance(value, int | float) and not isinstance(value, bool) and change.unit:
        try:
            value = convert(float(value), change.unit, definition.unit)
        except UnitMismatchError as exc:
            raise _invalid(definition, str(exc)) from exc
    if definition.type == "integer" and isinstance(value, float) and value.is_integer():
        value = int(value)
    check = validate_value(definition, value)
    if check.status == ValidationState.ERROR:
        raise _invalid(definition, check.message or "Некорректное значение", check.code)
    return value


def _invalid(definition: ParameterDef, message: str, code: str | None = None) -> DomainError:
    return ParamsInvalidError(
        f"«{definition.name}»: {message}",
        details=[
            {
                "loc": ["params", definition.key],
                "msg": message,
                "type": "value_error",
                "code": code or "INVALID",
            }
        ],
    )


def cross_check_issues(context: ProjectContext) -> list[ValidationIssue]:
    values = context.numeric()
    names = {p.key: p.definition.name for p in context.params}
    issues: list[ValidationIssue] = []
    for check in context.object_type.checks:
        if _passes(check, values):
            continue
        severity = Severity(check.severity)
        issues.append(
            ValidationIssue(
                key=check.params[0] if check.params else check.key,
                name=names.get(check.params[0], check.key) if check.params else check.key,
                severity=severity,
                code=f"CHECK_{check.key.upper()}",
                message=check.message,
                how_to_fix=check.how_to_fix,
                blocks=tuple(Blocks) if severity == Severity.ERROR else (),
            )
        )
    return issues


def _passes(check: CrossCheck, values: dict[str, float | None]) -> bool:
    try:
        return parse(check.expression).check(values)
    except MissingValueError:
        return True


class ParamsService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ProjectRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._audit = AuditLog(self._repo, user)

    async def context(self, project_id: UUID) -> ProjectContext:
        return await self._loader.context(self._user, project_id)

    async def apply(
        self,
        project_id: UUID,
        changes: list[ParamChange],
        status: ProvenanceStatus,
        *,
        source_id: UUID | None = None,
        overwrite_user: bool = True,
    ) -> ProjectContext:
        context = await self._loader.context(self._user, project_id, lock=True)
        definitions = {p.key: p.definition for p in context.params}
        unknown = sorted({c.key for c in changes} - set(definitions))
        if unknown:
            raise ParamsInvalidError(
                f"Неизвестные параметры: {', '.join(unknown)}",
                details=[
                    {"loc": ["params", key], "msg": "unknown parameter", "type": "value_error"}
                    for key in unknown
                ],
            )
        current = context.by_key
        changed = 0
        for change in changes:
            value = coerce(definitions[change.key], change)
            existing = current[change.key]
            if not overwrite_user and existing.provenance.status == ProvenanceStatus.USER:
                continue
            if value == existing.value and existing.provenance.status == status:
                continue
            await self._store(context.project, existing, change, value, status, source_id)
            changed += 1
        if changed:
            self._bump(context.project)
            self._audit.write(context.project.id, "project_params", "update", after={"changed": changed})
        await self._uow.flush()
        return await self.context(project_id)

    async def _store(
        self,
        project: Project,
        existing: EffectiveParam,
        change: ParamChange,
        value: Scalar,
        status: ProvenanceStatus,
        source_id: UUID | None,
    ) -> None:
        row = await self._repo.param(project.id, change.key)
        now = datetime.now(UTC)
        fields: dict[str, Any] = {
            "value": value,
            "unit": existing.definition.unit,
            "status": status,
            "source_id": source_id,
            "confidence": change.confidence,
            "raw_value": change.raw_value,
            "note": change.note,
            "changed_by": self._user.email,
            "changed_at": now,
        }
        if row is None:
            self._repo.add(ProjectParam(project_id=project.id, key=change.key, **fields))
        else:
            for name, field_value in fields.items():
                setattr(row, name, field_value)
        self._repo.add(
            ParamHistory(
                project_id=project.id,
                key=change.key,
                old_value=existing.value,
                new_value=value,
                status=status,
                note=change.note,
                changed_by=self._user.email,
                changed_at=now,
            )
        )

    def _bump(self, project: Project) -> None:
        project.version += 1
        project.updated_at = datetime.now(UTC)

    async def reset(self, project_id: UUID, key: str) -> EffectiveParam:
        context = await self._loader.context(self._user, project_id, lock=True)
        existing = context.by_key.get(key)
        if existing is None:
            raise ParamsInvalidError(f"Неизвестный параметр: {key}")
        row = await self._repo.param(project_id, key)
        if row is not None:
            await self._repo.delete_param(row)
            await self._uow.flush()
            refreshed = (await self.context(project_id)).by_key[key]
            self._repo.add(
                ParamHistory(
                    project_id=project_id,
                    key=key,
                    old_value=existing.value,
                    new_value=refreshed.value,
                    status=refreshed.provenance.status,
                    note="Сброс к значению по умолчанию",
                    changed_by=self._user.email,
                )
            )
            self._bump(context.project)
            self._audit.write(project_id, f"project_param:{key}", "delete", before={"value": existing.value})
            await self._uow.flush()
        return (await self.context(project_id)).by_key[key]

    async def history(self, project_id: UUID, key: str) -> list[ParamHistoryEntry]:
        await self._loader.project(self._user, project_id)
        rows = await self._repo.history(project_id, key, HISTORY_LIMIT)
        return [
            ParamHistoryEntry(r.changed_at, r.changed_by, r.old_value, r.new_value, r.status.value, r.note)
            for r in rows
        ]

    async def validation(self, project_id: UUID) -> ValidationReport:
        context = await self.context(project_id)
        return build_report(field_issues(context.params), cross_check_issues(context))

    async def data_quality(
        self, project_id: UUID, impact: Mapping[str, str] | None = None
    ) -> tuple[DataQualitySummary, list[DataQualityItem]]:
        context = await self.context(project_id)
        return data_quality(context.params, impact or {})
