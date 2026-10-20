from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Job
from app.domain.jobs import JobInfo, JobStatus


def to_info(job: Job) -> JobInfo:
    return JobInfo(
        id=job.id,
        type=job.type,
        status=job.status,
        owner_id=job.owner_id,
        progress=job.progress,
        stage=job.stage,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        result_url=job.result_url,
        error=job.error,
        project_id=UUID(job.payload["project_id"]) if job.payload.get("project_id") else None,
        scenario_id=UUID(job.payload["scenario_id"]) if job.payload.get("scenario_id") else None,
        label=job.payload.get("label"),
        kind=job.payload.get("kind"),
        completed_runs=job.payload.get("progress_detail", {}).get("completed_runs", 0),
        progress_updated_at=(
            datetime.fromisoformat(job.payload["progress_detail"]["updated_at"])
            if job.payload.get("progress_detail", {}).get("updated_at")
            else None
        ),
        eta_seconds=job.payload.get("progress_detail", {}).get("eta_seconds"),
    )


class JobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, job_id: UUID) -> Job | None:
        return await self._session.get(Job, job_id)

    def add(self, job: Job) -> None:
        self._session.add(job)

    async def recent(self, owner_id: UUID) -> list[Job]:
        statement = (
            select(Job)
            .where(
                Job.owner_id == owner_id,
                or_(
                    Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
                    Job.finished_at >= datetime.now(UTC) - timedelta(hours=24),
                ),
            )
            .order_by(Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]).desc(), Job.created_at.desc())
            .limit(100)
        )
        return list(await self._session.scalars(statement))

    async def active_sweep(self, scenario_id: UUID) -> Job | None:
        job: Job | None = await self._session.scalar(
            select(Job)
            .where(
                Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]),
                Job.payload["kind"].astext == "fleet_sweep",
                Job.payload["scenario_id"].astext == str(scenario_id),
            )
            .limit(1)
        )

        return job

    async def latest_sweep(self, scenario_id: UUID, process_key: str | None = None) -> Job | None:
        statement = (
            select(Job)
            .where(
                Job.status == JobStatus.DONE,
                Job.payload["kind"].astext == "fleet_sweep",
                Job.payload["scenario_id"].astext == str(scenario_id),
            )
            .order_by(Job.finished_at.desc())
            .limit(1)
        )
        if process_key is not None:
            statement = statement.where(Job.payload["process_key"].astext == process_key)
        job: Job | None = await self._session.scalar(statement)
        return job
