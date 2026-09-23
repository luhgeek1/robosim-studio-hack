import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


async def _demo(client: AsyncClient) -> tuple[str, dict[str, str]]:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    payload = {
        "name": "Склад",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    return project["id"], headers


def _process(body: dict, key: str) -> dict:
    return next(p for p in body["processes"] if p["process_key"] == key)


def _candidate(process: dict, name_part: str) -> dict:
    return next(c for c in process["candidates"] if name_part in c["product"]["name"])


async def test_matching_ranks_pallet_robots_with_reasons(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    assert body["weights"]["performance"] == 0.25
    pallets = _process(body, "pallet_transport")
    assert pallets["demand_summary"].startswith("137 палл/ч в пик")
    top = pallets["candidates"][0]
    assert top["status"] == "fit"
    assert top["rank"] == 1
    assert top["estimate"]["robots_count"] > 0
    assert sum(c["weight"] for c in top["score_breakdown"]) == pytest.approx(1)
    h1500 = _candidate(pallets, "H1500")
    assert any(r["code"] == "PAYLOAD_VS_PALLET_OK" for r in h1500["reasons"])
    assert h1500["estimate"]["robots_count"] > 10
    assert h1500["estimate"]["payback_years"] is not None


async def test_confirmed_mismatch_is_excluded_with_numbers(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    storage = _process(body, "high_bay_storage")
    asrs = _candidate(storage, "AS-RS P")
    assert asrs["status"] == "excluded"
    blocking = next(r for r in asrs["reasons"] if r["severity"] == "blocking")
    assert blocking["actual"] > blocking["required"]


async def test_params_change_matching(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    await client.patch(
        f"/api/v1/projects/{project_id}/params/ceiling_height_m", json={"value": 26}, headers=headers
    )
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    asrs = _candidate(_process(body, "high_bay_storage"), "AS-RS P")
    assert asrs["status"] != "excluded"


async def test_weights_are_saved_and_reused(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    run = await client.post(
        f"/api/v1/projects/{project_id}/matching",
        json={"weights": {"cost_efficiency": 1.0, "performance": 0.0}, "process_keys": ["pallet_transport"]},
        headers=headers,
    )
    assert run.status_code == 200
    again = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    assert [p["process_key"] for p in again["processes"]] == ["pallet_transport"]
    assert again["weights"]["cost_efficiency"] == 1.0


async def test_bad_weights_rejected(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    response = await client.post(
        f"/api/v1/projects/{project_id}/matching", json={"weights": {"luck": 1}}, headers=headers
    )
    assert response.status_code == 400


async def test_manual_add_keeps_warning(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    excluded = _candidate(_process(body, "high_bay_storage"), "AS-RS P")
    denied = await client.post(
        f"/api/v1/projects/{project_id}/matching/manual",
        json={
            "process_key": "high_bay_storage",
            "product_id": excluded["product"]["id"],
            "acknowledge_warning": False,
        },
        headers=headers,
    )
    assert denied.status_code == 400
    added = await client.post(
        f"/api/v1/projects/{project_id}/matching/manual",
        json={
            "process_key": "high_bay_storage",
            "product_id": excluded["product"]["id"],
            "acknowledge_warning": True,
        },
        headers=headers,
    )
    assert added.status_code == 200
    candidate = added.json()
    assert candidate["status"] == "manual"
    assert any(r["severity"] == "blocking" for r in candidate["reasons"])


async def test_candidates_are_of_the_process_solution_types(client: AsyncClient) -> None:
    project_id, headers = await _demo(client)
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    picking = next(p for p in body["processes"] if p["process_key"] == "order_picking")
    allowed = {t["key"] for t in picking["solution_types"]}
    assert {c["product"]["solution_type"] for c in picking["candidates"]} <= allowed
    assert "palletizing_arm" not in {c["product"]["solution_type"] for c in picking["candidates"]}
