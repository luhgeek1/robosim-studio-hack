import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


async def _scenario(client: AsyncClient) -> tuple[str, str, dict[str, str]]:
    headers = bearer((await login(client, "user@roboscope.demo"))["access"])
    payload = {
        "name": "Склад",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    body = (await client.get(f"/api/v1/projects/{project['id']}/matching", headers=headers)).json()
    candidates = next(p for p in body["processes"] if p["process_key"] == "pallet_transport")["candidates"]
    product = next(c for c in candidates if "H1500" in c["product"]["name"])["product"]["id"]
    scenario = {
        "name": "Паллеты на AMR",
        "kind": "purchase",
        "items": [{"process_key": "pallet_transport", "product_id": product}],
    }
    response = await client.post(
        f"/api/v1/projects/{project['id']}/scenarios", json=scenario, headers=headers
    )
    assert response.status_code == 201, response.text
    return project["id"], response.json()["id"], headers


async def test_simulation_runs_in_background_and_reports_kpis(client: AsyncClient) -> None:
    _, scenario_id, headers = await _scenario(client)
    response = await client.post(
        f"/api/v1/scenarios/{scenario_id}/simulations", json={"mode": "peak", "seed": 5}, headers=headers
    )
    assert response.status_code == 202, response.text
    run_id = response.json()["id"]
    # Inline jobs run after the response; the test client returns once background tasks are done.
    run = (await client.get(f"/api/v1/simulations/{run_id}", headers=headers)).json()
    assert run["status"] == "done", run
    summary = run["summary"]
    assert summary["sla"]["target_pct"] == 95
    assert summary["vs_analytic"]["verdict"] in {"confirmed", "shortfall"}
    assert summary["bottleneck"]["explanation"]
    assert run["fleet"][0]["count"] >= 1
    assert run["versions"]["layout_version"] == 1
    assert run["events_count"] > 0

    timeline = (
        await client.get(f"/api/v1/simulations/{run_id}/timeline", params={"step_min": 15}, headers=headers)
    ).json()
    assert len(timeline["points"]) > 5
    replay = (
        await client.get(
            f"/api/v1/simulations/{run_id}/replay", params={"from_s": 1800, "to_s": 2400}, headers=headers
        )
    ).json()
    assert replay["events"]
    assert replay["robots"]
    assert replay["layout"]["nodes"]
    assert replay["next_from_s"] == 2400
    nodes = {n["id"] for n in replay["layout"]["nodes"]}
    moves = [e for e in replay["events"] if e["type"] == "move"]
    assert all(set(e["path"]) <= nodes for e in moves)
    heat = (await client.get(f"/api/v1/simulations/{run_id}/heatmap", headers=headers)).json()
    assert heat["edges"]
    listed = (await client.get(f"/api/v1/scenarios/{scenario_id}/simulations", headers=headers)).json()
    assert [item["id"] for item in listed["items"]] == [run_id]
    stream = await client.get(f"/api/v1/simulations/{run_id}/stream", headers=headers)
    assert "event: done" in stream.text


async def test_stress_run_with_failure_and_more_volume(client: AsyncClient) -> None:
    _, scenario_id, headers = await _scenario(client)
    payload = {
        "mode": "custom",
        "duration_hours": 8,
        "volume_multiplier": 1.2,
        "failures": [{"robot_index": 0, "at_hour": 2, "duration_hours": 2}],
        "fleet_override": [{"process_key": "pallet_transport", "count": 6}],
        "record_events": False,
    }
    run_id = (
        await client.post(f"/api/v1/scenarios/{scenario_id}/simulations", json=payload, headers=headers)
    ).json()["id"]
    run = (await client.get(f"/api/v1/simulations/{run_id}", headers=headers)).json()
    assert run["status"] == "done"
    assert run["fleet"][0]["count"] == 6
    assert run["summary"]["utilization"]["by_state"]["failed"] > 0
    replay = await client.get(f"/api/v1/simulations/{run_id}/replay", headers=headers)
    assert replay.status_code == 409


async def test_fleet_sweep_sets_the_scenario_count(client: AsyncClient) -> None:
    project_id, scenario_id, headers = await _scenario(client)
    before = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    analytic = before["sizing"][0]["count"]
    response = await client.post(
        f"/api/v1/scenarios/{scenario_id}/fleet-sweep",
        json={"process_key": "pallet_transport"},
        headers=headers,
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["id"]
    job = (await client.get(f"/api/v1/jobs/{job_id}", headers=headers)).json()
    assert job["status"] == "done", job
    result = (
        await client.get(f"/api/v1/scenarios/{scenario_id}/fleet-sweep/{job_id}", headers=headers)
    ).json()
    recommended = result["recommended_count"]
    assert recommended is not None
    assert result["applied"]
    points = {p["count"]: p for p in result["points"]}
    assert points[recommended]["passed"]
    assert points[recommended]["capex_rub"] > 0
    assert "минимальное N" in result["explanation"]

    stale = (await client.get(f"/api/v1/calculations/{before['id']}", headers=headers)).json()
    assert stale["status"] == "stale"
    after = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    count = after["sizing"][0]["count"]
    assert count["source"] == "simulated"
    assert count["simulated"] == recommended
    assert count["simulation_id"] == result["simulation_id"]
    assert count["final"] == recommended + count["reserve"]
    # The simulated fleet covers the peak: the effect is not cut and no under-capacity risk is raised.
    assert after["sizing"][0]["coverage_of_peak"] == 1
    assert "UNDER_CAPACITY" not in {risk["code"] for risk in after["risks"]}
    assert analytic["analytic"] >= recommended - 1
    best = (await client.get(f"/api/v1/simulations/{result['simulation_id']}", headers=headers)).json()
    assert best["purpose"] == "sweep"
    assert best["fleet"][0]["count"] == recommended

    param = {"key": "shift_hours", "value": 12}
    await client.patch(f"/api/v1/projects/{project_id}/params/shift_hours", json=param, headers=headers)
    moved = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    assert moved["sizing"][0]["count"]["source"] == "analytic"
    assert any("перезапустите перебор флота" in w for w in moved["warnings"])


async def test_simulation_needs_a_layout_and_a_simulatable_process(client: AsyncClient) -> None:
    headers = bearer((await login(client, "user@roboscope.demo"))["access"])
    payload = {
        "name": "Больница",
        "object_type": "hospital",
        "init": {"mode": "demo", "demo_key": "hospital_demo_01"},
    }
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    scenarios = (await client.get(f"/api/v1/projects/{project['id']}/scenarios", headers=headers)).json()
    baseline = scenarios["items"][0]["id"]
    response = await client.post(
        f"/api/v1/scenarios/{baseline}/simulations", json={"mode": "normal"}, headers=headers
    )
    assert response.status_code == 409


async def test_foreign_user_cannot_see_a_run(client: AsyncClient) -> None:
    _, scenario_id, headers = await _scenario(client)
    run_id = (
        await client.post(
            f"/api/v1/scenarios/{scenario_id}/simulations",
            json={"mode": "peak", "record_events": False},
            headers=headers,
        )
    ).json()["id"]
    stranger = bearer((await login(client, "vendor@roboscope.demo"))["access"])
    assert (await client.get(f"/api/v1/simulations/{run_id}", headers=stranger)).status_code in {403, 404}
