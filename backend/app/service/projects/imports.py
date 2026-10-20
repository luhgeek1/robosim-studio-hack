from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import FileTooLargeError, NotFoundError, ParamsInvalidError, UnsupportedFileTypeError
from app.db.models import ParamImport, Source
from app.db.repositories.projects import ProjectRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser, Role
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.domain.project.models import Severity, ValidationReport
from app.domain.project.params import build_report, field_issues
from app.infra.importers.limits import check_guest_file
from app.infra.importers.models import ImportFormatError
from app.infra.importers.parser import parse_file
from app.service.projects.audit import AuditLog
from app.service.projects.context import ProjectContext, ProjectLoader
from app.service.projects.import_review import (
    initial_rows,
    is_ready,
    preview_context,
    review_rows,
    stored_rows,
)
from app.service.projects.norms import NormLoader
from app.service.projects.params import ParamChange, ParamsService, cross_check_issues

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
    rows: list[dict[str, Any]]
    validation: ValidationReport


def _store_rows(item: ParamImport, rows: list[dict[str, Any]]) -> None:
    item.mapped = [row for row in rows if is_ready(row)]
    item.unmapped = [row for row in rows if not is_ready(row)]


class ImportService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ProjectRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._audit = AuditLog(self._repo, user)

    async def parse(self, project_id: UUID, filename: str, content: bytes) -> ImportView:
        if self._user.role == Role.GUEST:
            check_guest_file(content)
        if len(content) > MAX_FILE_BYTES:
            raise FileTooLargeError(f"Файл больше {MAX_FILE_BYTES // (1024 * 1024)} МБ")
        context = await self._loader.context(self._user, project_id)
        try:
            parsed = parse_file(
                content, filename, context.object_type.parameters, bounded=self._user.role == Role.GUEST
            )
        except ImportFormatError as exc:
            raise UnsupportedFileTypeError(str(exc)) from exc
        if parsed.object_type and parsed.object_type != context.project.object_type:
            raise ParamsInvalidError(
                f"Тип объекта файла: «{parsed.object_type}», проекта: «{context.project.object_type}». "
                "Откройте проект нужного типа или загрузите соответствующий файл"
            )
        rows = review_rows(context, initial_rows(parsed.rows))
        warnings = [
            warning
            for warning in parsed.warnings
            if not any(
                marker in warning for marker in ("пропущен", "повторяет", "прочитано как", "понято как")
            )
        ]
        item = ParamImport(
            project_id=project_id,
            source_kind=parsed.source_kind.value,
            provider=PROVIDER_RULES,
            filename=filename,
            mapped=[],
            unmapped=[],
            warnings=warnings,
            applied=False,
            created_by=self._user.email,
        )
        _store_rows(item, rows)
        self._repo.add(item)
        await self._uow.flush()
        self._audit.write(
            project_id, f"import:{item.id}", "import", after={"file": filename, "mapped": len(item.mapped)}
        )
        return await self._view(item, context)

    async def _view(self, item: ParamImport, context: ProjectContext, overwrite: bool = False) -> ImportView:
        rows = stored_rows(item.mapped, item.unmapped)
        preview = preview_context(context, rows, overwrite)
        norms = await NormLoader(self._uow).book(context.project.object_type)
        validation = build_report(field_issues(preview.params), cross_check_issues(preview, norms))
        mapped_fields = {
            "key",
            "name",
            "value",
            "unit",
            "raw_field",
            "raw_value",
            "status",
            "confidence",
            "conflict_with_current",
        }
        return ImportView(
            item.id,
            item.source_kind,
            item.provider,
            [{k: v for k, v in row.items() if k in mapped_fields} for row in item.mapped],
            [
                {
                    "raw_field": row["raw_field"],
                    "raw_value": row["raw_value"],
                    "suggestion_key": row.get("suggestion_key"),
                }
                for row in item.unmapped
                if not row.get("excluded")
            ],
            list(item.warnings),
            item.applied,
            rows,
            validation,
        )

    async def review(
        self, project_id: UUID, import_id: UUID, edits: list[dict[str, Any]], overwrite: bool
    ) -> ImportView:
        context = await self._loader.context(self._user, project_id, lock=True)
        item = await self._item(project_id, import_id)
        rows = stored_rows(item.mapped, item.unmapped)
        by_id = {row["row_id"]: row for row in rows}
        ids = [edit["row_id"] for edit in edits]
        if len(ids) != len(set(ids)) or set(ids) - set(by_id):
            raise ParamsInvalidError("Неизвестные или повторяющиеся строки исправлений")
        for edit in edits:
            by_id[edit["row_id"]].update(edit)
            by_id[edit["row_id"]]["confidence"] = 1.0
        _store_rows(item, review_rows(context, rows))
        await self._uow.flush()
        return await self._view(item, context, overwrite)

    async def _item(self, project_id: UUID, import_id: UUID) -> ParamImport:
        item = await self._repo.import_(project_id, import_id)
        if item is None:
            raise NotFoundError("Результат импорта не найден")
        if item.applied:
            raise ParamsInvalidError("Этот импорт уже применён. Загрузите файл заново для нового импорта")
        return item

    async def apply(
        self,
        project_id: UUID,
        import_id: UUID,
        accept_keys: list[str],
        overwrite_user: bool,
        row_ids: list[str] | None = None,
    ) -> ProjectContext:
        context = await self._loader.context(self._user, project_id, lock=True)
        item = await self._item(project_id, import_id)
        stored = stored_rows(item.mapped, item.unmapped)
        accepted = set(accept_keys)
        if row_ids is not None and set(row_ids) - {r["row_id"] for r in stored}:
            raise ParamsInvalidError("Выбраны неизвестные строки импорта")
        if accepted - {r.get("key") for r in [*item.mapped, *item.unmapped]}:
            raise ParamsInvalidError("Выбраны неизвестные параметры импорта")
        selected = [
            r
            for r in stored
            if not r.get("excluded")
            and (r["row_id"] in row_ids if row_ids is not None else not accepted or r.get("key") in accepted)
        ]
        rows = (
            review_rows(context, selected)
            if stored
            else [r for r in item.mapped if not accepted or r["key"] in accepted]
        )
        if not rows or any(not is_ready(r) for r in rows):
            raise ParamsInvalidError("Исправьте ошибки в выбранных строках или исключите их из импорта")
        preview = preview_context(context, rows, overwrite_user)
        norms = await NormLoader(self._uow).book(context.project.object_type)
        errors = [i.message for i in cross_check_issues(preview, norms) if i.severity == Severity.ERROR]
        if errors:
            raise ParamsInvalidError("Параметры противоречат друг другу: " + "; ".join(errors))
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
