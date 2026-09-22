import pytest
from httpx import AsyncClient

from tests.integration.test_scenarios_api import _demo, _purchase

pytestmark = pytest.mark.integration


async def test_default_sensitivity_has_at_least_three_parameters(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    response = await client.post(
        f"/api/v1/scenarios/{scenario['id']}/sensitivity", json={"metric": "npv_rub"}, headers=headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    keys = {item["key"] for item in body["items"]}
    assert {"equipment_price", "operations_volume", "labor_cost"} <= keys
    assert len(body["items"]) >= 3
    swings = [item["swing"] for item in body["items"]]
    assert swings == sorted(swings, reverse=True)
    norm = next(item for item in body["items"] if item["kind"] == "norm")
    assert norm["provenance_status"] in {"assumption", "default"}


async def test_heatmap_and_custom_parameters(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    payload = {
        "metric": "npv_rub",
        "parameters": [{"key": "forklift_salary_rub_month", "low_pct": -10, "high_pct": 30}],
        "heatmap": {"x_key": "labor_cost", "y_key": "operations_volume", "steps": 3},
    }
    body = (
        await client.post(f"/api/v1/scenarios/{scenario['id']}/sensitivity", json=payload, headers=headers)
    ).json()
    item = body["items"][0]
    assert item["kind"] == "param"
    assert item["high_input"] == pytest.approx(item["base_input"] * 1.3)
    assert len(body["heatmap"]["z"]) == 3


async def test_monte_carlo_analytic(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    url = f"/api/v1/scenarios/{scenario['id']}/monte-carlo"
    body = (await client.post(url, json={"n": 200, "metric": "npv_rub", "seed": 3}, headers=headers)).json()
    assert body["method"] == "analytic"
    assert body["p10"] <= body["p50"] <= body["p90"]
    assert sum(body["histogram"]["counts"]) == body["n"]
    assert "npv_positive" in body["probability"]
    again = (await client.post(url, json={"n": 200, "metric": "npv_rub", "seed": 3}, headers=headers)).json()
    assert again["p50"] == body["p50"]
    custom = await client.post(
        url,
        json={
            "n": 100,
            "distributions": [
                {"key": "equipment_price", "dist": "uniform", "params": {"low": 0.9, "high": 1.1}}
            ],
        },
        headers=headers,
    )
    assert custom.status_code == 200
    surrogate = await client.post(url, json={"method": "surrogate"}, headers=headers)
    assert surrogate.status_code == 409


async def test_survey_priorities_are_unverified_inputs(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    body = (await client.get(f"/api/v1/scenarios/{scenario['id']}/survey-priorities", headers=headers)).json()
    assert body["items"]
    assert all(item["status"] in {"default", "assumption", "missing"} for item in body["items"])
    assert [item["rank"] for item in body["items"]] == list(range(1, len(body["items"]) + 1))
    assert any(item["how_to_measure"] for item in body["items"])


async def test_narrative_falls_back_to_rules(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{scenario['id']}/calculate", headers=headers)).json()
    body = (await client.get(f"/api/v1/calculations/{run['id']}/narrative", headers=headers)).json()
    assert body["generated_by"] == "rules"
    assert body["executive_summary"].startswith(run["interpretation"]["headline"])
    assert any("имитацию" in step for step in body["next_steps"])


async def test_baseline_has_no_sensitivity(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    listed = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()
    baseline = listed["items"][0]["id"]
    response = await client.post(f"/api/v1/scenarios/{baseline}/sensitivity", headers=headers)
    assert response.status_code == 409


async def test_trust_panel_ranks_parameter_impact_by_the_latest_calculation(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    url = f"/api/v1/projects/{project_id}/data-quality"
    before = (await client.get(url, headers=headers)).json()
    assert {item["impact"] for item in before["items"]} == {"unknown"}
    scenario = await _purchase(client, headers, project_id)
    await client.post(f"/api/v1/scenarios/{scenario['id']}/calculate", headers=headers)
    items = {item["key"]: item["impact"] for item in (await client.get(url, headers=headers)).json()["items"]}
    assert items["forklift_salary_rub_month"] == "high"
    assert items["sku_count"] == "low"
    assert set(items.values()) <= {"high", "medium", "low"}
