from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.db.models import Job, Scenario
from app.db.repositories.users import to_current_user
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.service.reports.collect import ReportCollector
from tests.integration.test_simulation_api import _scenario, _sweep

pytestmark = pytest.mark.integration


async def _collected(settings: Settings, scenario_id: str) -> dict[str, Any]:
    database = Database(settings)
    try:
        async with UnitOfWork(database.session()) as uow:
            user = await uow.users.get_by_email("user@robomera.demo")
            scenario = await uow.session.get(Scenario, UUID(scenario_id))
            assert user is not None
            assert scenario is not None
            result = await ReportCollector(uow, to_current_user(user))._simulation(scenario)
            assert result is not None
            return result
    finally:
        await database.dispose()


async def test_report_uses_current_evidence_and_sanitizes_historical_sweeps(
    client: AsyncClient, settings: Settings
) -> None:
    project_id, scenario_id, headers = await _scenario(client)
    job_id, sweep = await _sweep(client, scenario_id, headers)
    assert sweep["applied"]
    current = await _collected(settings, scenario_id)
    assert current["count_source"] == "simulated"
    assert current["evidence_current"]
    assert current["id"] == sweep["simulation_id"]
    assert current["summary"]

    scenario = (await client.get(f"/api/v1/scenarios/{scenario_id}", headers=headers)).json()
    project = (await client.get(f"/api/v1/projects/{project_id}", headers=headers)).json()
    item = {"process_key": "pallet_transport", "product_id": scenario["items"][0]["product_id"]}
    priced = {
        **item,
        "price_override_rub": 3_000_000,
        "override_reason": "Проверка сохранения доказательства",
    }
    updated = await client.patch(
        f"/api/v1/scenarios/{scenario_id}", json={"items": [priced]}, headers=headers
    )
    assert updated.status_code == 200, updated.text
    price_only = await _collected(settings, scenario_id)
    assert price_only["count_source"] == "simulated"
    assert price_only["id"] == current["id"]

    changed = {**priced, "stations": {"count_mode": "manual", "count": 1}}
    updated = await client.patch(
        f"/api/v1/scenarios/{scenario_id}", json={"items": [changed]}, headers=headers
    )
    assert updated.status_code == 200, updated.text
    same_project = (await client.get(f"/api/v1/projects/{project_id}", headers=headers)).json()
    assert same_project["version"] == project["version"]
    stale = await _collected(settings, scenario_id)
    assert stale["count_source"] == "analytic"
    assert not stale["evidence_current"]
    assert stale["id"] is None
    assert stale["summary"] is None
    assert stale["heatmap"] is None
    assert stale["fleet"] == []
    assert not stale["sweep"]["applied"]
    assert stale["sweep"]["recommended_count"] is None
    assert stale["sweep"]["by_simulation"] is None
    assert "устарело" in stale["sweep"]["explanation"]

    await _mark_joint_failure(settings, job_id)
    failed_joint = await _collected(settings, scenario_id)
    assert failed_joint["count_source"] == "analytic"
    assert not failed_joint["evidence_current"]
    assert failed_joint["summary"] is None
    assert not failed_joint["sweep"]["applied"]
    assert failed_joint["sweep"]["joint_validation"]["status"] == "failed"


async def _mark_joint_failure(settings: Settings, job_id: str) -> None:
    database = Database(settings)
    try:
        async with UnitOfWork(database.session()) as uow:
            job = await uow.session.get(Job, UUID(job_id))
            assert job is not None
            assert job.result is not None
            job.result = {
                **job.result,
                "applied": False,
                "recommended_count": None,
                "by_simulation": None,
                "joint_validation": {"status": "failed"},
            }
            await uow.commit()
    finally:
        await database.dispose()
