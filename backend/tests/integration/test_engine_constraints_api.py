import pytest
from httpx import AsyncClient

from tests.integration.test_object_rules_api import _calculate, _demo
from tests.integration.test_simulation_api import _scenario

pytestmark = pytest.mark.integration


async def test_narrow_layout_is_not_simulated_as_passable(client: AsyncClient) -> None:
    project_id, scenario_id, headers = await _scenario(client)
    url = f"/api/v1/projects/{project_id}/layout"
    layout = (await client.get(url, headers=headers)).json()
    edges = [{**edge, "width_m": 0.2} for edge in layout["edges"]]
    changed = await client.put(url, json={"edges": edges}, headers=headers)
    assert changed.status_code == 200, changed.text
    matching = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    pallets = next(p for p in matching["processes"] if p["process_key"] == "pallet_transport")
    assert all(c["status"] in {"excluded", "check"} for c in pallets["candidates"])
    assert next(c for c in pallets["candidates"] if "H1500" in c["product"]["name"])["status"] == "excluded"
    assert any(r["code"] == "LAYOUT_ROUTE_BLOCKED" for c in pallets["candidates"] for r in c["reasons"])
    started = await client.post(
        f"/api/v1/scenarios/{scenario_id}/simulations", json={"mode": "peak"}, headers=headers
    )
    assert started.status_code == 202, started.text
    run = (await client.get(f"/api/v1/simulations/{started.json()['id']}", headers=headers)).json()
    assert run["status"] == "failed"
    assert "ширина" in run["error"]["detail"]
    assert not run.get("summary")


async def test_sanitation_norm_reaches_the_event_simulation(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "hospital")
    calculation = await _calculate(client, headers, project_id, "waste_transport", "H1500")
    scenario_id = calculation["scenario_id"]
    events = []
    for seconds in (120, 600):
        changed = await client.patch(
            f"/api/v1/scenarios/{scenario_id}",
            json={"overrides": [{"norm_key": "disinfection_time_s", "value": seconds, "reason": "Замер"}]},
            headers=headers,
        )
        assert changed.status_code == 200, changed.text
        started = await client.post(
            f"/api/v1/scenarios/{scenario_id}/simulations", json={"mode": "peak", "seed": 42}, headers=headers
        )
        assert started.status_code == 202, started.text
        run_id = started.json()["id"]
        run = (await client.get(f"/api/v1/simulations/{run_id}", headers=headers)).json()
        assert run["status"] == "done", run
        replay = (await client.get(f"/api/v1/simulations/{run_id}/replay", headers=headers)).json()
        service = [e for e in replay["events"] if e.get("reason") == "turnaround"]
        assert service
        assert all(e["dur"] == seconds for e in service)
        events.append(replay["events"])
    assert events[0] != events[1]


async def test_recommendation_preview_and_created_scenario_agree(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "warehouse")
    matching = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    expected = {
        p["process_key"]: p["recommended_product_id"]
        for p in matching["processes"]
        if p["recommended_product_id"]
    }
    assert expected
    created = await client.post(
        f"/api/v1/projects/{project_id}/scenarios",
        json={"name": "Рекомендация", "kind": "purchase", "from_recommendation": True},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    assert {i["process_key"]: i["product_id"] for i in created.json()["items"]} == expected
    assert all("NPV" in i["notes"] for i in created.json()["items"])
