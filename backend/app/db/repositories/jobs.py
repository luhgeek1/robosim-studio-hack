from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Job
from app.domain.jobs import JobInfo


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
    )


class JobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, job_id: UUID) -> Job | None:
        return await self._session.get(Job, job_id)

    def add(self, job: Job) -> None:
        self._session.add(job)
