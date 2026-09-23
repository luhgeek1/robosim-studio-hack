import asyncio
import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from arq.connections import RedisSettings, create_pool

from app.core.config import Settings
from app.db.session import Database
from app.service.reports.service import run_report
from app.service.simulations.runner import run_fleet_sweep, run_simulation

logger = logging.getLogger(__name__)

Runner = Callable[[Database, UUID], Awaitable[None]]
JOB_FUNCTION = "run_job"
RUNNERS: dict[str, Runner] = {
    "simulation": run_simulation,
    "fleet_sweep": run_fleet_sweep,
    "report": run_report,
}


async def execute(db: Database, name: str, job_id: UUID) -> None:
    """Runs a registered job; failures are recorded by the runner itself, this only guards the loop."""
    runner = RUNNERS.get(name)
    if runner is None:
        logger.error("job_unknown", extra={"job": name, "job_id": str(job_id)})
        return
    try:
        await runner(db, job_id)
    except Exception:
        logger.exception("job_crashed", extra={"job": name, "job_id": str(job_id)})


class JobQueue:
    """Hands a committed job to the worker (arq) or runs it in this process after the response (inline)."""

    def __init__(self, settings: Settings, db: Database) -> None:
        self._settings = settings
        self._db = db

    async def dispatch(self, name: str, job_id: UUID) -> None:
        if self._settings.jobs_backend == "arq":
            pool = await create_pool(RedisSettings.from_dsn(self._settings.redis_url))
            try:
                await pool.enqueue_job(JOB_FUNCTION, name, str(job_id), _job_id=str(job_id))
            finally:
                await pool.aclose()
            return
        await asyncio.wait_for(execute(self._db, name, job_id), timeout=self._settings.job_timeout_s)
