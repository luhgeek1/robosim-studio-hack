import asyncio
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus
from app.service.jobs.queue import RUNNERS, JobQueue, execute
from app.service.simulations.progress import Progress
from tests.integration.test_simulation_api import _scenario

pytestmark = pytest.mark.integration


async def _hold(self: JobQueue, name: str, job_id: UUID) -> None:
    pass


async def test_active_sweep_is_reused_and_progress_is_persisted(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(JobQueue, "dispatch", _hold)
    _, scenario, headers = await _scenario(client)
    url = f"/api/v1/scenarios/{scenario}/fleet-sweep"
    first = (await client.post(url, json={"process_key": "pallet_transport"}, headers=headers)).json()
    second = (await client.post(url, json={"process_key": "pallet_transport"}, headers=headers)).json()
    assert first["id"] == second["id"]
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            job = await uow.jobs.get(UUID(first["id"]))
            assert job is not None
            job.status = JobStatus.RUNNING
            await uow.commit()
        progress = Progress(db, UUID(first["id"]))
        progress(1, "Первый прогон")
        progress(0.4, "Второй прогон")
        await asyncio.sleep(0)
        await progress.flush()
        restored = (await client.get("/api/v1/jobs", headers=headers)).json()["items"][0]
        assert restored["progress"] == 0.4
        assert restored["completed_runs"] == 1
        assert restored["stage"] == "Второй прогон"
        assert restored["progress_updated_at"]
        assert restored["eta_seconds"] is not None
    finally:
        await db.dispose()


async def test_worker_cancellation_finishes_job_and_run(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(JobQueue, "dispatch", _hold)
    _, scenario, headers = await _scenario(client)
    response = await client.post(
        f"/api/v1/scenarios/{scenario}/simulations", json={"mode": "peak"}, headers=headers
    )
    run = response.json()
    entered = asyncio.Event()

    async def cancelled(db: Database, job_id: UUID) -> None:
        entered.set()
        await asyncio.Event().wait()

    monkeypatch.setitem(RUNNERS, "simulation", cancelled)
    db = Database(settings)
    try:
        task = asyncio.create_task(execute(db, "simulation", UUID(run["job_id"])))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        job = (await client.get(f"/api/v1/jobs/{run['job_id']}", headers=headers)).json()
        assert job["status"] == "failed"
        assert job["finished_at"]
        assert "лимит времени" in job["error"]["detail"]
        after = (await client.get(f"/api/v1/simulations/{run['id']}", headers=headers)).json()
        assert after["status"] == "failed"
    finally:
        await db.dispose()
