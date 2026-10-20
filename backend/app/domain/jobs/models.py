from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class JobType(StrEnum):
    SIMULATION = "simulation"
    MONTE_CARLO = "monte_carlo"
    REPORT = "report"
    ENRICHMENT = "enrichment"
    IMPORT = "import"
    CALIBRATION = "calibration"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class JobInfo:
    id: UUID
    type: JobType
    status: JobStatus
    owner_id: UUID | None
    progress: float
    stage: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    result_url: str | None
    error: dict[str, Any] | None
    project_id: UUID | None = None
    scenario_id: UUID | None = None
    label: str | None = None
    kind: str | None = None
    completed_runs: int = 0
    progress_updated_at: datetime | None = None
    eta_seconds: int | None = None
