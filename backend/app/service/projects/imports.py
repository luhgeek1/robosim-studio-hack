from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import DomainError, FileTooLargeError, NotFoundError, UnsupportedFileTypeError
from app.db.models import ParamImport, Source
from app.db.repositories.projects import ProjectRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.infra.importers.models import ImportFormatError, MappedValue
from app.infra.importers.parser import parse_file
from app.service.projects.audit import AuditLog
from app.service.projects.context import ProjectContext, ProjectLoader
from app.service.projects.params import ParamChange, ParamsService, coerce

MAX_FILE_BYTES = 20 * 1024 * 1024
PROVIDER_RULES = "rules"


@dataclass(frozen=True, slots=True)
class ImportView:
    id: UUID
    source_kind: str
    provider: str
    mapped: list[dict[str, Any]]
    unmapped: list[dict[str, Any]]
    warnings: list[str]
    applied: bool


def _view(item: ParamImport) -> ImportView:
    return ImportView(
        item.id,
        item.source_kind,
        item.provider,
        item.mapped,
        item.unmapped,
        list(item.warnings),
        item.applied,
    )


def _mapped_row(context: ProjectContext, value: MappedValue, warnings: list[str]) -> dict[str, Any] | None:
    param = context.by_key[value.key]
    try:
        coerced = coerce(param.definition, ParamChange(key=value.key, value=value.value, unit=value.unit))
    except DomainError as exc:
        warnings.append(f"{value.raw_field or param.definition.name}: {exc.detail}")
        return None
    row: dict[str, Any] = {
        "key": value.key,
        "name": param.definition.name,
        "value": coerced,
        "unit": param.definition.unit,
        "raw_field": value.raw_field,
        "raw_value": value.raw_value,
        "status": ProvenanceStatus.IMPORTED.value,
        "confidence": value.confidence,
    }
    current_is_data = param.provenance.status in {ProvenanceStatus.USER, ProvenanceStatus.IMPORTED}
    if current_is_data and param.value != coerced:
        row["conflict_with_current"] = {
            "current_value": param.value,
            "current_status": param.provenance.status.value,
        }
    return row


class ImportService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ProjectRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._audit = AuditLog(self._repo, user)

    async def parse(self, project_id: UUID, filename: str, content: bytes) -> ImportView:
        if len(content) > MAX_FILE_BYTES:
            raise FileTooLargeError(f"Файл больше {MAX_FILE_BYTES // (1024 * 1024)} МБ")
        context = await self._loader.context(self._user, project_id)
        try:
            parsed = parse_file(content, filename, context.object_type.parameters)
        except ImportFormatError as exc:
            raise UnsupportedFileTypeError(str(exc)) from exc
        warnings = list(parsed.warnings)
        mapped = [
            row for value in parsed.mapped if (row := _mapped_row(context, value, warnings)) is not None
        ]
        item = ParamImport(
            project_id=project_id,
            source_kind=parsed.source_kind.value,
            provider=PROVIDER_RULES,
            filename=filename,
            mapped=mapped,
            unmapped=[
                {"raw_field": u.raw_field, "raw_value": u.raw_value, "suggestion_key": u.suggestion_key}
                for u in parsed.unmapped
            ],
            warnings=warnings,
            applied=False,
            created_by=self._user.email,
        )
        self._repo.add(item)
        await self._uow.flush()
        self._audit.write(
            project_id, f"import:{item.id}", "import", after={"file": filename, "mapped": len(mapped)}
        )
        return _view(item)

    async def apply(
        self, project_id: UUID, import_id: UUID, accept_keys: list[str], overwrite_user: bool
    ) -> ProjectContext:
        await self._loader.project(self._user, project_id)
        item = await self._repo.import_(project_id, import_id)
        if item is None:
            raise NotFoundError("Результат импорта не найден")
        accepted = set(accept_keys)
        rows = [row for row in item.mapped if not accepted or row["key"] in accepted]
        source = Source(
            kind=SourceKind.USER_INPUT,
            title=f"Файл «{item.filename}»" if item.filename else "Импорт параметров",
            retrieved_at=datetime.now(UTC).date(),
            note=f"Загружен {item.created_by}",
        )
        self._repo.add(source)
        await self._uow.flush()
        changes = [
            ParamChange(
                key=row["key"],
                value=row["value"],
                raw_value=row.get("raw_value"),
                confidence=row.get("confidence"),
                note=f"Импорт из файла, поле «{row.get('raw_field')}»",
            )
            for row in rows
        ]
        context = await ParamsService(self._uow, self._user).apply(
            project_id, changes, ProvenanceStatus.IMPORTED, source_id=source.id, overwrite_user=overwrite_user
        )
        item.applied = True
        await self._uow.flush()
        return context
