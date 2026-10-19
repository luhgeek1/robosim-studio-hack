from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.conftest import bearer
from tests.integration.test_guest_workspace import guest


@pytest.mark.parametrize(
    "key", ["warehouse_demo_01", "warehouse_showcase_24x7", "hospital_demo_01", "airport_demo_01"]
)
async def test_prepared_copy_is_complete_private_and_retry_safe(client: AsyncClient, key: str) -> None:
    public = f"/api/v1/demo/projects/{key}"
    await client.get(public)
    prepared = await client.get(public)
    assert prepared.status_code == 200, prepared.text
    snapshot = prepared.json()
    a = bearer((await guest(client))["access_token"])
    request = {"request_id": str(uuid4()), "revision": snapshot["revision"]}
    opened = await client.post(f"{public}/open", json=request, headers=a)
    assert opened.status_code == 200, opened.text
    project_id = opened.json()["project"]["id"]
    project = f"/api/v1/projects/{project_id}"
    assert project_id != snapshot["comparison"]["project_id"]
    scenarios = (await client.get(f"{project}/scenarios", headers=a)).json()["items"]
    assert {s["kind"] for s in scenarios} == {"baseline", "purchase", "raas", "lease"}
    purchase = next(s for s in scenarios if s["kind"] == "purchase")
    scenario = f"/api/v1/scenarios/{purchase['id']}"
    runs = await client.get(f"{scenario}/simulations", headers=a)
    assert runs.status_code == 200, runs.text
    run_id = runs.json()["items"][0]["id"]
    assert run_id != snapshot["simulation"]["id"]
    sweep = await client.get(f"{scenario}/fleet-sweep", headers=a)
    assert sweep.status_code == 200, sweep.text
    assert sweep.json()["applied"] == snapshot["sweep"]["applied"]
    replay = await client.get(f"/api/v1/simulations/{run_id}/replay", headers=a)
    assert replay.status_code == 200, replay.text
    b = bearer((await guest(client))["access_token"])
    assert (await client.get(project, headers=b)).status_code == 404
    assert (await client.get(f"/api/v1/simulations/{run_id}/replay", headers=b)).status_code == 404
    await client.patch(project, json={"name": "Мой эксперимент"}, headers=a)
    retry = await client.post(f"{public}/open", json=request, headers=a)
    assert retry.json()["project"]["id"] == project_id
    assert retry.json()["project"]["name"] == "Мой эксперимент"
    assert (await client.get("/api/v1/projects", headers=a)).json()["total"] == 1
    assert (await client.get(public)).json()["demo"]["name"] == snapshot["demo"]["name"]
    # The prepared large example must also allow a real new guest run, not just replay the cache.
    started = await client.post(f"{scenario}/simulations", json={"mode": "peak"}, headers=a)
    assert started.status_code == 202, started.text

    final = await client.get(f"/api/v1/simulations/{started.json()['id']}", headers=a)
    assert final.json()["status"] == "done", final.text
    if key == "warehouse_demo_01":
        await assert_edit_invalidates_copy(client, scenario, public, purchase["items"][0], a, snapshot)


async def assert_edit_invalidates_copy(
    client: AsyncClient, scenario: str, public: str, item: dict, a: dict, snapshot: dict
) -> None:
    change = {
        "process_key": item["process_key"],
        "product_id": item["product_id"],
        "stations": {"count_mode": "manual", "count": 1},
    }
    changed = await client.patch(scenario, json={"items": [change]}, headers=a)
    assert changed.status_code == 200, changed.text
    latest = await client.get(f"{scenario}/fleet-sweep", headers=a)
    assert not latest.json()["applied"]
    original = await client.get(public)
    assert original.json()["sweep"]["applied"] == snapshot["sweep"]["applied"]
