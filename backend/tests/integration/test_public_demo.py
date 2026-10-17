from httpx import AsyncClient

from tests.conftest import bearer, login

BASE = "/api/v1/demo/projects"


async def test_guest_journey_is_isolated_and_reuses_calculation_engine(client: AsyncClient) -> None:
    examples = (await client.get(BASE)).json()["items"]
    assert {item["object_type"] for item in examples} == {"warehouse", "hospital", "airport"}
    url = f"{BASE}/warehouse_demo_01"
    preparing = await client.get(url)
    assert preparing.status_code == 202
    ready = await client.get(url)
    assert ready.status_code == 200, ready.text
    demo = ready.json()
    assert len(demo["comparison"]["scenarios"]) == 4
    assert demo["simulation"]["events_count"] > 0
    primary = next(c for c in demo["calculations"] if c["scenario_id"] == demo["primary_scenario_id"])
    base = await client.post(f"{url}/what-if", json={})
    assert base.status_code == 200, base.text
    assert base.json()["metrics"] == primary["metrics"]
    changed = await client.post(f"{url}/what-if", json={"salary_multiplier": 1.5})
    assert changed.json()["metrics"]["effect_rub_year"] != primary["metrics"]["effect_rub_year"]
    volume = await client.post(f"{url}/what-if", json={"volume_multiplier": 1.5})
    assert volume.status_code == 200, volume.text
    assert volume.json()["simulation_valid"] is False
    assert all(s["count"]["source"] != "simulated" for s in volume.json()["calculation"]["sizing"])
    assert (await client.get(url)).json() == demo
    assert (await client.post(f"{url}/what-if?revision=outdated", json={})).status_code == 409
    assert (await client.get(f"{url}/replay?revision=outdated")).status_code == 409
    assert (await client.get(f"{url}/report/pdf?revision=outdated")).status_code == 409
    replay = await client.get(f"{url}/replay", params={"from_s": 0, "to_s": 600})
    assert replay.status_code == 200, replay.text
    assert replay.json()["events"]
    assert (await client.get(f"{url}/replay?to_s=7200")).status_code == 422
    for fmt, signature in (("pdf", b"%PDF"), ("xlsx", b"PK")):
        report = await client.get(f"{url}/report/{fmt}")
        assert report.status_code == 200, report.text[:200]
        assert report.content.startswith(signature)
    project_id = demo["comparison"]["project_id"]
    assert (await client.get(f"/api/v1/projects/{project_id}")).status_code == 401
    token = await login(client, "user@robomera.demo")
    assert (
        await client.get(f"/api/v1/projects/{project_id}", headers=bearer(token["access"]))
    ).status_code == 404
    assert (await client.get(f"{BASE}/{project_id}")).status_code == 404
    assert (await client.post(f"{url}/what-if", json={"volume_multiplier": 100})).status_code == 422
    assert (await client.post(f"{url}/what-if", json={"project_id": project_id})).status_code == 422


async def test_additional_examples_are_complete_and_guest_inputs_are_transient(client: AsyncClient) -> None:
    for key in ("warehouse_showcase_24x7", "hospital_demo_01", "airport_demo_01"):
        url = f"{BASE}/{key}"
        await client.get(url)
        response = await client.get(url)
        assert response.status_code == 200, (key, response.text)
        demo = response.json()
        assert demo["matching"]["processes"]
        assert demo["calculations"]
        result = await client.post(
            f"{url}/what-if",
            json={"scenario_kind": "raas", "labor_cash_realization_share": 0, "horizon_years": 3},
        )
        assert result.status_code == 200, result.text
        assert result.json()["metrics"]["labor_savings_rub_year"] == 0
        assert result.json()["metrics"]["horizon_years"] == 3
        assert (await client.get(url)).json() == demo


async def test_guest_price_override_has_user_provenance(client: AsyncClient) -> None:
    url = f"{BASE}/warehouse_demo_01"
    await client.get(url)
    result = await client.post(
        f"{url}/what-if", json={"robot_price_multiplier": 1.5, "salary_multiplier": 1.2}
    )
    assert result.status_code == 200, result.text
    calculation = result.json()["calculation"]
    prices = [
        value
        for item in calculation["capex"]["items"]
        for value in item["inputs"]
        if value["key"].endswith(".price_rub")
    ]
    assert prices
    assert all(value["provenance"]["status"] == "user" for value in prices)
