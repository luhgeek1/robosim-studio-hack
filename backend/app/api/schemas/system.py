"""System endpoints and background jobs (platform.yaml#/Health, #/SystemVersion; common.yaml#/Job)."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.jobs import JobInfo, JobStatus, JobType

CheckState = Literal["ok", "fail", "skipped"]


class Health(ApiModel):
    status: Literal["ok", "degraded", "down"]
    checks: dict[str, CheckState] = Field(default_factory=dict)


class SystemVersion(ApiModel):
    app_version: str
    engine_version: str
    catalog_version: str
    norm_set_version: str
    llm_enabled: bool = False
    build_sha: str | None = None


class Job(ApiModel):
    id: UUID
    type: JobType
    status: JobStatus
    progress: float = Field(ge=0, le=1)
    stage: str | None = Field(default=None, examples=["Прогон пикового дня, час 14 из 24"])
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result_url: str | None = None
    error: dict[str, Any] | None = None

    @classmethod
    def from_domain(cls, job: JobInfo) -> "Job":
        return cls.model_validate(job)
