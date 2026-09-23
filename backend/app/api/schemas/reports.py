from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.layouts import FileRef
from app.db.models import Report as ReportRow, StoredFile
from app.domain.jobs import JobStatus
from app.domain.reports.models import ReportFormat, ReportSection

API_PREFIX = "/api/v1"


class ReportRequest(ApiModel):
    format: ReportFormat
    scenario_ids: list[UUID] = Field(default_factory=list, description="Если пусто — все сценарии проекта")
    sections: list[ReportSection] = Field(default_factory=list, description="Если пусто — все")
    simulation_ids: list[UUID] = Field(default_factory=list)
    visual_ids: list[UUID] = Field(default_factory=list, description="Загруженные снимки имитации")
    title: str | None = Field(default=None, max_length=200)
    live_formulas: bool = Field(default=True, description="Для xlsx — формулы, а не значения")


class Report(ApiModel):
    id: UUID
    project_id: UUID
    format: ReportFormat
    status: JobStatus
    file: FileRef | None = None
    versions: dict[str, object] | None = None
    sections: list[ReportSection]
    disclaimer: str
    job_id: UUID | None = None
    error: dict[str, object] | None = None
    created_at: datetime
    finished_at: datetime | None = None

    @classmethod
    def from_row(cls, report: ReportRow, stored: StoredFile | None) -> "Report":
        return cls(
            id=report.id,
            project_id=report.project_id,
            format=ReportFormat(report.format),
            status=report.status,
            file=FileRef(
                url=f"{API_PREFIX}/reports/{report.id}/download",
                filename=stored.filename,
                content_type=stored.content_type,
                size_bytes=stored.size_bytes,
            )
            if stored is not None
            else None,
            versions=report.versions,
            sections=[ReportSection(s) for s in report.sections],
            disclaimer=report.disclaimer,
            job_id=report.job_id,
            error=report.error,
            created_at=report.created_at,
            finished_at=report.finished_at,
        )


class ReportList(ApiModel):
    items: list[Report]


class VisualUpload(ApiModel):
    id: UUID
    kind: Literal["simulation_png", "simulation_gif", "chart_png"]
    simulation_id: UUID | None = None
    file: FileRef
    caption: str | None = None
