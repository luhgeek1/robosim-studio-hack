import asyncio
import json
import logging
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.errors import ConflictError, ErrorCode, InvalidInputError, NotFoundError, job_problem
from app.db.models import Job, Project, Report, StoredFile
from app.db.repositories.users import to_current_user
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.jobs import JobStatus, JobType
from app.domain.reports.models import DISCLAIMER, ReportFormat, ReportModel, ReportSection
from app.infra.reports.pdf import render_pdf
from app.infra.reports.xlsx import render_xlsx
from app.service.projects.context import ProjectLoader
from app.service.reports.collect import ReportCollector, ReportRequest

logger = logging.getLogger(__name__)

REPORT_NOT_FOUND = "Отчёт не найден или недоступен"
REPORT_JOB = "report"
REPORT_PURPOSE = "report"
VISUAL_PURPOSE = "simulation_visual"
API_PREFIX = "/api/v1"
MEDIA_TYPES = {
    ReportFormat.PDF: "application/pdf",
    ReportFormat.XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ReportFormat.JSON: "application/json",
}
SUPPORTED = frozenset(MEDIA_TYPES)


def _json(model: ReportModel) -> bytes:
    data = asdict(model)
    data["visuals"] = [{"caption": v.caption, "content_type": v.content_type} for v in model.visuals]
    return json.dumps(data, ensure_ascii=False, default=str, indent=1).encode()


def render(model: ReportModel, fmt: ReportFormat) -> bytes:
    if fmt == ReportFormat.PDF:
        return render_pdf(model)
    if fmt == ReportFormat.XLSX:
        return render_xlsx(model)
    return _json(model)


def filename(project: str, fmt: ReportFormat, at: datetime) -> str:
    safe = "".join(ch if ch.isalnum() else "_" for ch in project).strip("_")[:60] or "project"
    return f"robomera_{safe}_{at:%Y%m%d_%H%M}.{fmt.value}"


class ReportService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._loader = ProjectLoader(uow)

    async def create(self, project_id: UUID, fmt: ReportFormat, request: dict[str, Any]) -> Report:
        if fmt not in SUPPORTED:
            raise InvalidInputError("Формат DOCX пока не поддерживается: выберите PDF, Excel или JSON")
        project = await self._loader.project(self._user, project_id)
        job = Job(type=JobType.REPORT, owner_id=self._user.id, payload={"kind": REPORT_JOB})
        self._uow.session.add(job)
        await self._uow.flush()
        report = Report(
            project_id=project.id,
            owner_id=self._user.id,
            job_id=job.id,
            format=fmt.value,
            status=JobStatus.QUEUED,
            title=request.get("title"),
            sections=request.get("sections") or [s.value for s in ReportSection],
            request=request,
            disclaimer=DISCLAIMER,
        )
        self._uow.session.add(report)
        await self._uow.flush()
        job.payload = {"kind": REPORT_JOB, "report_id": str(report.id)}
        return report

    async def runs(self, project_id: UUID) -> list[Report]:
        await self._loader.project(self._user, project_id)
        rows = await self._uow.session.scalars(
            select(Report).where(Report.project_id == project_id).order_by(Report.created_at.desc())
        )
        return list(rows.all())

    async def get(self, report_id: UUID) -> Report:
        report = await self._uow.session.scalar(
            select(Report)
            .join(Project, Project.id == Report.project_id)
            .where(Report.id == report_id, Project.owner_id == self._user.id)
        )
        if report is None:
            raise NotFoundError(REPORT_NOT_FOUND)
        return report

    async def file(self, report: Report) -> StoredFile | None:
        return await self._uow.session.get(StoredFile, report.file_id) if report.file_id else None

    async def download(self, report_id: UUID) -> StoredFile:
        report = await self.get(report_id)
        stored = await self.file(report)
        if report.status == JobStatus.FAILED:
            raise ConflictError((report.error or {}).get("detail", "Отчёт не сформирован"))
        if report.status != JobStatus.DONE or stored is None:
            raise ConflictError("Отчёт ещё формируется", error_code=ErrorCode.JOB_NOT_READY)
        return stored

    async def stored(self, file_id: UUID) -> StoredFile:
        stored = await self._uow.session.scalar(
            select(StoredFile)
            .join(Project, Project.id == StoredFile.project_id)
            .where(StoredFile.id == file_id, Project.owner_id == self._user.id)
        )
        if stored is None:
            raise NotFoundError("Файл не найден или недоступен")
        return stored

    async def upload_visual(
        self, project_id: UUID, simulation_id: UUID, name: str, content_type: str, data: bytes
    ) -> StoredFile:
        stored = StoredFile(
            owner_id=self._user.id,
            project_id=project_id,
            purpose=VISUAL_PURPOSE,
            filename=name,
            content_type=content_type,
            size_bytes=len(data),
            data=data,
        )
        self._uow.session.add(stored)
        await self._uow.flush()
        return stored


def _problem(detail: str, job_id: UUID, report_id: UUID) -> dict[str, Any]:
    return job_problem(
        status=409,
        detail=detail,
        error_code=ErrorCode.CONFLICT,
        instance=f"{API_PREFIX}/reports/{report_id}",
        job_id=str(job_id),
    )


async def run_report(db: Database, job_id: UUID) -> None:
    async with UnitOfWork(db.session()) as uow:
        job = await uow.jobs.get(job_id)
        report = await uow.session.get(Report, UUID(job.payload["report_id"])) if job else None
        if job is None or report is None:
            return
        owner = await uow.users.get(report.owner_id)
        if owner is None:
            return
        job.status = report.status = JobStatus.RUNNING
        job.started_at, job.stage = datetime.now(UTC), "Сбор данных и пересчёт сценариев"
        await uow.commit()
        # A rollback expires the loaded rows: the failure path must not touch them again.
        report_id, request = report.id, report.request
        try:
            model = await ReportCollector(uow, to_current_user(owner)).collect(
                report.project_id,
                ReportRequest(
                    sections=[ReportSection(s) for s in report.sections],
                    scenario_ids=[UUID(s) for s in request.get("scenario_ids") or []],
                    visual_ids=[UUID(v) for v in request.get("visual_ids") or []],
                    title=report.title,
                    live_formulas=request.get("live_formulas", True),
                ),
            )
            await uow.commit()
        except ConflictError as exc:
            await uow.rollback()
            await _fail(db, job_id, report_id, exc.detail)
            return
        except Exception:
            logger.exception("report_collect_failed", extra={"report_id": str(report_id)})
            await uow.rollback()
            await _fail(db, job_id, report_id, "Не удалось собрать данные отчёта")
            return
        fmt = ReportFormat(report.format)
        try:
            data = await asyncio.to_thread(render, model, fmt)
        except Exception:
            logger.exception("report_render_failed", extra={"report_id": str(report_id)})
            await _fail(db, job_id, report_id, "Не удалось сформировать файл отчёта")
            return
        stored = StoredFile(
            owner_id=report.owner_id,
            project_id=report.project_id,
            purpose=REPORT_PURPOSE,
            filename=filename(model.project["name"], fmt, model.generated_at),
            content_type=MEDIA_TYPES[fmt],
            size_bytes=len(data),
            data=data,
        )
        uow.session.add(stored)
        await uow.flush()
        report.file_id = stored.id
        report.versions = model.versions
        report.status = job.status = JobStatus.DONE
        report.finished_at = job.finished_at = datetime.now(UTC)
        job.progress = 1.0
        job.result_url = f"{API_PREFIX}/reports/{report.id}/download"
        await uow.commit()


async def _fail(db: Database, job_id: UUID, report_id: UUID, detail: str) -> None:
    async with UnitOfWork(db.session()) as uow:
        for item in (await uow.jobs.get(job_id), await uow.session.get(Report, report_id)):
            if item is not None:
                item.status = JobStatus.FAILED
                item.error = _problem(detail, job_id, report_id)
                item.finished_at = datetime.now(UTC)
        await uow.commit()
