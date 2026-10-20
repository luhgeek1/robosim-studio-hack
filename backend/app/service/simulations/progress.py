import asyncio
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.db.models import SimulationRun
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus


class Progress:
    def __init__(self, db: Database, job_id: UUID, run_id: UUID | None = None) -> None:
        self.db, self.job_id, self.run_id = db, job_id, run_id
        self.loop = asyncio.get_running_loop()
        self.pending: tuple[float, str, dict[str, Any]] | None = None
        self.stage = ""
        self.started = time.monotonic()
        self.completed = 0

    def __call__(self, fraction: float, stage: str) -> None:
        self.loop.call_soon_threadsafe(self._update, fraction, stage)

    def _update(self, fraction: float, stage: str) -> None:
        if stage != self.stage:
            self.stage, self.started = stage, time.monotonic()
        if fraction == 1:
            self.completed += 1
        elapsed = time.monotonic() - self.started
        self.pending = (
            fraction,
            stage,
            {
                "completed_runs": self.completed,
                "updated_at": datetime.now(UTC).isoformat(),
                # This estimates only this run, never an adaptive search of unknown length.
                "eta_seconds": round(elapsed * (1 - fraction) / fraction) if 0.1 <= fraction < 1 else None,
            },
        )

    async def flush(self) -> None:
        pending, self.pending = self.pending, None
        if pending is None:
            return
        fraction, stage, detail = pending
        async with UnitOfWork(self.db.session()) as uow:
            job = await uow.jobs.get(self.job_id)
            if job is None or job.status != JobStatus.RUNNING:
                return
            job.progress, job.stage = fraction, stage
            job.payload = {**job.payload, "progress_detail": detail}
            if self.run_id:
                run = await uow.session.get(SimulationRun, self.run_id)
                if run is not None and run.status == JobStatus.RUNNING:
                    run.progress, run.stage = fraction, stage
            await uow.commit()

    async def run[T](self, function: Callable[..., T], *args: Any) -> T:
        task = asyncio.create_task(asyncio.to_thread(function, *args))
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.5)
                await self.flush()
            return await task
        finally:
            task.cancel()
