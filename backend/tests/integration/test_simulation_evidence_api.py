from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.db.models import Job, Scenario
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.scenario.models import CountMode
from app.engine.simulation.joint import JointSweep
from app.service.simulations import runner
from app.service.simulations.progress import Progress
from tests.integration.test_simulation_api import _scenario, _sweep

pytestmark = pytest.mark.integration


async def test_price_only_patch_preserves_evidence_but_station_change_invalidates(
    client: AsyncClient,
    settings: Settings,
) -> None:
    _, scenario_id, headers = await _scenario(client)
    job_id, evidence = await _sweep(client, scenario_id, headers)
    assert evidence["applied"]
    assert evidence["joint_validation"]["status"] == "passed"
    scenario = (await client.get(f"/api/v1/scenarios/{scenario_id}", headers=headers)).json()
    item = {"process_key": "pallet_transport", "product_id": scenario["items"][0]["product_id"]}
    priced = {**item, "price_override_rub": 3_000_000, "override_reason": "Тест цены по КП"}
    response = await client.patch(
        f"/api/v1/scenarios/{scenario_id}", json={"items": [priced]}, headers=headers
    )
    assert response.status_code == 200, response.text
    calculation = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    assert calculation["sizing"][0]["count"]["source"] == "simulated"
    latest = (await client.get(f"/api/v1/scenarios/{scenario_id}/fleet-sweep", headers=headers)).json()
    assert latest["applied"]
    assert latest["by_simulation"]["capex_rub"] == pytest.approx(calculation["metrics"]["capex_rub"])
    assert latest["by_simulation"]["npv_rub"] == pytest.approx(calculation["metrics"]["npv_rub"])
    assert latest["by_simulation"]["capex_rub"] != evidence["by_simulation"]["capex_rub"]
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            job = await uow.session.get(Job, UUID(job_id))
            assert job is not None
            assert job.result is not None
            assert job.result["by_simulation"] == evidence["by_simulation"]
    finally:
        await db.dispose()

    changed = {**priced, "stations": {"count_mode": "manual", "count": 1}}
    response = await client.patch(
        f"/api/v1/scenarios/{scenario_id}", json={"items": [changed]}, headers=headers
    )
    assert response.status_code == 200, response.text
    calculation = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    assert calculation["sizing"][0]["count"]["source"] == "analytic"
    assert any("перезапустите перебор флота" in warning for warning in calculation["warnings"])
    latest = (await client.get(f"/api/v1/scenarios/{scenario_id}/fleet-sweep", headers=headers)).json()
    assert not latest["applied"]
    assert latest["recommended_count"] is None


async def test_sweep_finishing_after_an_edit_cannot_overwrite_the_new_scenario(
    client: AsyncClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, scenario_id, headers = await _scenario(client)
    original = runner._sweep

    async def edit_during_sweep(payload: dict[str, Any], progress: Progress) -> JointSweep:
        result = await original(payload, progress)
        async with UnitOfWork(progress.db.session()) as uow:
            scenario = await uow.session.get(Scenario, UUID(scenario_id))
            assert scenario is not None
            scenario.items[0].stations_mode = CountMode.MANUAL
            scenario.items[0].stations_count = 1
            scenario.version += 1
            await uow.commit()
        return result

    monkeypatch.setattr(runner, "_sweep", edit_during_sweep)
    _, result = await _sweep(client, scenario_id, headers)
    assert result["joint_validation"]["status"] == "passed"
    assert not result["applied"]
    assert result["recommended_count"] is None
    assert "изменились во время перебора" in result["explanation"]
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            scenario = await uow.session.get(Scenario, UUID(scenario_id))
            assert scenario is not None
            assert scenario.items[0].stations_count == 1
            assert scenario.items[0].simulated_count is None
    finally:
        await db.dispose()
