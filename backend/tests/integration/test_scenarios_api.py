import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


async def _demo(client: AsyncClient) -> tuple[str, dict[str, str]]:
    headers = bearer((await login(client, "user@roboscope.demo"))["access"])
    payload = {
        "name": "Склад",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    return project["id"], headers


async def _product(
    client: AsyncClient, headers: dict[str, str], project_id: str, process: str, name: str
) -> str:
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    candidates = next(p for p in body["processes"] if p["process_key"] == process)["candidates"]
    return next(c for c in candidates if name in c["product"]["name"])["product"]["id"]


async def _purchase(client: AsyncClient, headers: dict[str, str], project_id: str) -> dict:
    product = await _product(client, headers, project_id, "pallet_transport", "H1500")
    payload = {
        "name": "Покупка: паллеты на AMR",
        "kind": "purchase",
        "items": [{"process_key": "pallet_transport", "product_id": product}],
    }
    response = await client.post(f"/api/v1/projects/{project_id}/scenarios", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_baseline_is_created_and_protected(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    body = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()
    baseline = body["items"][0]
    assert baseline["is_baseline"]
    assert baseline["kind"] == "baseline"
    assert baseline["horizon_years"] == 5
    again = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()
    assert len(again["items"]) == 1
    deleted = await client.delete(f"/api/v1/scenarios/{baseline['id']}", headers=headers)
    assert deleted.status_code == 409


async def test_calculate_purchase_returns_full_economics(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    assert scenario["items"][0]["price_source"] == "catalog"
    response = await client.post(f"/api/v1/scenarios/{scenario['id']}/calculate", headers=headers)
    assert response.status_code == 200, response.text
    run = response.json()
    sizing = run["sizing"][0]
    assert sizing["count"]["source"] == "analytic"
    assert sizing["count"]["final"] == sizing["count"]["analytic"] + sizing["count"]["reserve"]
    capex_keys = {item["key"] for item in run["capex"]["items"]}
    assert {"capex_delivery", "capex_commissioning", "capex_integration", "capex_contingency"} <= capex_keys
    assert run["capex"]["total_rub"] == pytest.approx(run["metrics"]["capex_rub"])
    effect = run["effect_year"]["items"][0]
    assert effect["kind"] == "cost_reduction"
    assert effect["inputs"][0]["provenance"]["status"] in {"default", "derived", "user"}
    assert len(run["cashflow"]["monthly"]) == 60
    assert run["interpretation"]["headline"]
    assert run["versions"]["inputs_hash"]
    assert run["calibration"]["checks"]
    assert any(norm["key"] == "commissioning_share_of_hardware" for norm in run["assumptions_used"])
    listed = (await client.get(f"/api/v1/projects/{project_id}/scenarios", headers=headers)).json()
    summary = next(s for s in listed["items"] if s["id"] == scenario["id"])["last_calculation"]
    assert summary["status"] == "fresh"
    assert summary["calculation_id"] == run["id"]


async def test_trace_has_no_undocumented_constants(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{scenario['id']}/calculate", headers=headers)).json()
    trace = (await client.get(f"/api/v1/calculations/{run['id']}/trace", headers=headers)).json()
    assert trace["undocumented_constants"] == 0
    keys = {item["metric_key"] for item in trace["items"]}
    assert {"pallet_transport.cycle_time_s", "capex_total", "effect_total", "npv_rub"} <= keys
    capex = (
        await client.get(f"/api/v1/calculations/{run['id']}/trace?section=capex", headers=headers)
    ).json()
    assert all(item["section"] == "capex" for item in capex["items"])


async def test_params_change_makes_run_stale_and_rerun_explains(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{scenario['id']}/calculate", headers=headers)).json()
    await client.patch(
        f"/api/v1/projects/{project_id}/params/forklift_salary_rub_month",
        json={"value": 150000},
        headers=headers,
    )
    stale = (await client.get(f"/api/v1/calculations/{run['id']}", headers=headers)).json()
    assert stale["status"] == "stale"
    rerun = (await client.post(f"/api/v1/calculations/{run['id']}/rerun", headers=headers)).json()
    effect = next(d for d in rerun["diff"] if d["metric_key"] == "effect_rub_year")
    assert effect["new"] > effect["old"]
    assert any("Параметр" in cause for cause in effect["causes"])


async def test_raas_copy_and_comparison_recommends(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    purchase = await _purchase(client, headers, project_id)
    raas = await client.post(
        f"/api/v1/scenarios/{purchase['id']}/copy", json={"kind": "raas"}, headers=headers
    )
    assert raas.status_code == 201
    assert raas.json()["items"][0]["product_id"] == purchase["items"][0]["product_id"]
    table = (await client.get(f"/api/v1/projects/{project_id}/comparison", headers=headers)).json()
    assert len(table["scenarios"]) == 3
    kinds = {s["kind"] for s in table["scenarios"]}
    assert kinds == {"baseline", "purchase", "raas"}
    payback = next(r for r in table["rows"] if r["metric_key"] == "payback_years")
    assert payback["better"] == "lower"
    assert table["recommendation"]["scenario_id"]
    assert set(table["cashflow_overlay"]) == {s["scenario_id"] for s in table["scenarios"]}
    by_kind = {s["kind"]: table["cashflow_overlay"][s["scenario_id"]] for s in table["scenarios"]}
    # One chart against «как сейчас»: the baseline is the zero line, purchase starts at minus its CAPEX.
    assert all(point["cumulative_rub"] == 0 for point in by_kind["baseline"])
    assert by_kind["purchase"][0]["period"] == 0
    assert by_kind["purchase"][0]["cumulative_rub"] < by_kind["raas"][0]["cumulative_rub"] <= 0
    project = (await client.get(f"/api/v1/projects/{project_id}", headers=headers)).json()
    assert project["scenarios_count"] == 3
    assert project["recommended_scenario_id"] == table["recommendation"]["scenario_id"]
    assert project["last_calculation_id"]


async def test_overrides_and_manual_values_are_validated(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    url = f"/api/v1/scenarios/{scenario['id']}"
    locked = await client.patch(
        url, json={"overrides": [{"norm_key": "vat_rate", "value": 0.2, "reason": "тест"}]}, headers=headers
    )
    assert locked.status_code == 422
    product = scenario["items"][0]["product_id"]
    no_reason = await client.patch(
        url,
        json={
            "items": [{"process_key": "pallet_transport", "product_id": product, "price_override_rub": 2e6}]
        },
        headers=headers,
    )
    assert no_reason.status_code == 422
    ok = await client.patch(
        url,
        json={
            "overrides": [{"norm_key": "effective_speed_factor", "value": 0.75, "reason": "Замер на пилоте"}],
            "items": [
                {
                    "process_key": "pallet_transport",
                    "product_id": product,
                    "price_override_rub": 2_500_000,
                    "override_reason": "Коммерческое предложение вендора",
                }
            ],
        },
        headers=headers,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["overrides"][0]["default_value"] == 0.6
    assert body["items"][0]["price_rub"] == 2_500_000
    run = (await client.post(f"{url}/calculate", headers=headers)).json()
    robots = next(i for i in run["capex"]["items"] if i["key"] == "capex_equipment.pallet_transport")
    assert robots["inputs"][0]["provenance"]["status"] == "user"


async def test_wrong_product_for_process_is_rejected(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    cleaner = await _product(client, headers, project_id, "floor_cleaning", "")
    response = await client.post(
        f"/api/v1/projects/{project_id}/scenarios",
        json={
            "name": "x",
            "kind": "purchase",
            "items": [{"process_key": "pallet_transport", "product_id": cleaner}],
        },
        headers=headers,
    )
    assert response.status_code == 422


async def test_from_recommendation_fills_items(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    response = await client.post(
        f"/api/v1/projects/{project_id}/scenarios",
        json={"name": "Рекомендация", "kind": "purchase", "from_recommendation": True},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    processes = {item["process_key"] for item in response.json()["items"]}
    assert "pallet_transport" in processes


async def test_other_users_cannot_see_scenarios(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    scenario = await _purchase(client, headers, project_id)
    admin = bearer((await login(client, "admin@roboscope.demo"))["access"])
    response = await client.get(f"/api/v1/scenarios/{scenario['id']}", headers=admin)
    assert response.status_code == 404


async def test_project_copy_takes_scenarios_along(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    await _purchase(client, headers, project_id)
    copy = (
        await client.post(f"/api/v1/projects/{project_id}/copy", json={"name": "Копия"}, headers=headers)
    ).json()
    listed = (await client.get(f"/api/v1/projects/{copy['id']}/scenarios", headers=headers)).json()
    assert [s["kind"] for s in listed["items"]] == ["baseline", "purchase"]
    assert listed["items"][1]["last_calculation"] is None
