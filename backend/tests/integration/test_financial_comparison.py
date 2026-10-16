from copy import deepcopy
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.db.models import CalculationRun, Scenario
from tests.integration.test_scenarios_api import _demo, _purchase

pytestmark = pytest.mark.integration


async def _make_apparently_attractive(settings: Settings, run_id: str, *, legacy: bool) -> None:
    engine = create_async_engine(settings.database_url)
    async with async_sessionmaker(engine)() as session:
        run = await session.get(CalculationRun, UUID(run_id))
        assert run is not None
        result = deepcopy(run.result)
        if legacy:
            result["cashflow"] = result.pop("owner_cashflow")
            run.engine_version = "legacy-finance"
        run.npv_rub = 1e15
        run.payback_years = 1
        run.verdict = "attractive"
        result["metrics"].update(npv_rub=1e15, payback_years=1, roi_pct=1000)
        result["interpretation"].update(verdict="attractive", band="lt3")
        run.result = result
        scenario = await session.get(Scenario, run.scenario_id)
        assert scenario is not None
        scenario.is_recommended = True
        await session.commit()
    await engine.dispose()


async def test_legacy_equity_value_is_not_compared_as_project_value(
    client: AsyncClient, settings: Settings
) -> None:
    project_id, headers = await _demo(client)
    legacy = await _purchase(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{legacy['id']}/calculate", headers=headers)).json()
    await _make_apparently_attractive(settings, run["id"], legacy=True)
    current = (
        await client.post(f"/api/v1/scenarios/{legacy['id']}/copy", json={"name": "Новый"}, headers=headers)
    ).json()
    await client.post(f"/api/v1/scenarios/{current['id']}/calculate", headers=headers)
    # Calculating the other scenario refreshes the recommendation without selecting the huge stale NPV.
    listed = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()["items"]
    assert not next(item for item in listed if item["id"] == legacy["id"])["is_recommended"]
    await _make_apparently_attractive(settings, run["id"], legacy=False)
    url = f"/api/v1/projects/{project_id}/comparison"
    response = await client.get(url, params={"recalculate_stale": False}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert legacy["id"] not in {item["scenario_id"] for item in body["scenarios"]}
    assert legacy["id"] not in body["cashflow_overlay"]
    assert all(legacy["id"] not in row["values"] for row in body["rows"])
    assert any("прежняя финансовая модель" in note for note in body["recommendation"]["caveats"])
    listed = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()["items"]
    assert not next(item for item in listed if item["id"] == legacy["id"])["is_recommended"]
    refreshed = (await client.get(url, headers=headers)).json()
    assert legacy["id"] in refreshed["cashflow_overlay"]
    assert (
        refreshed["recommendation"]["scenario_id"] != legacy["id"]
        or next(item for item in refreshed["scenarios"] if item["scenario_id"] == legacy["id"])["metrics"][
            "npv_rub"
        ]
        < 1e15
    )


async def test_stale_current_model_is_visible_but_cannot_be_recommended(
    client: AsyncClient, settings: Settings
) -> None:
    project_id, headers = await _demo(client)
    purchase = await _purchase(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{purchase['id']}/calculate", headers=headers)).json()
    await _make_apparently_attractive(settings, run["id"], legacy=False)
    await client.patch(
        f"/api/v1/projects/{project_id}/params/forklift_salary_rub_month",
        json={"value": 150000},
        headers=headers,
    )
    response = await client.get(
        f"/api/v1/projects/{project_id}/comparison", params={"recalculate_stale": False}, headers=headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (
        next(item for item in body["scenarios"] if item["scenario_id"] == purchase["id"])["status"] == "stale"
    )
    assert purchase["id"] in body["cashflow_overlay"]
    assert body["recommendation"]["scenario_id"] is None
    assert all(row["best_scenario_id"] is None for row in body["rows"])
    assert body["verdict"]["verdict"] == "insufficient_data"
    listed = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()["items"]
    assert not any(item["is_recommended"] for item in listed)
