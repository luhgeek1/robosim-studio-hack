import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

PROJECTS = "/api/v1/projects"


async def _auth(client: AsyncClient, email: str = "user@roboscope.demo") -> dict[str, str]:
    return bearer((await login(client, email))["access"])


async def _demo(client: AsyncClient, headers: dict[str, str], object_type: str = "warehouse") -> dict:
    payload = {
        "name": "Демо",
        "object_type": object_type,
        "init": {"mode": "demo", "demo_key": f"{object_type}_demo_01"},
    }
    response = await client.post(PROJECTS, json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_guest_cannot_list_projects(client: AsyncClient) -> None:
    assert (await client.get(PROJECTS)).status_code == 401


async def test_create_list_get_update_delete(client: AsyncClient) -> None:
    headers = await _auth(client)
    created = await _demo(client, headers)
    assert created["is_demo"] is True
    assert created["version"] == 1

    listed = (await client.get(PROJECTS, headers=headers)).json()
    assert listed["total"] == 1

    patched = await client.patch(
        f"{PROJECTS}/{created['id']}", json={"name": "РЦ Север", "tags": ["пилот"]}, headers=headers
    )
    assert patched.json()["name"] == "РЦ Север"
    assert patched.json()["tags"] == ["пилот"]

    assert (await client.delete(f"{PROJECTS}/{created['id']}", headers=headers)).status_code == 204
    assert (await client.get(f"{PROJECTS}/{created['id']}", headers=headers)).status_code == 404


async def test_projects_are_isolated_between_users(client: AsyncClient) -> None:
    owner = await _auth(client)
    project = await _demo(client, owner)
    stranger = await _auth(client, "vendor@roboscope.demo")
    assert (await client.get(f"{PROJECTS}/{project['id']}", headers=stranger)).status_code == 404
    assert (await client.get(PROJECTS, headers=stranger)).json()["total"] == 0


async def test_unknown_demo_key_404(client: AsyncClient) -> None:
    headers = await _auth(client)
    payload = {"name": "x", "object_type": "warehouse", "init": {"mode": "demo", "demo_key": "nope"}}
    assert (await client.post(PROJECTS, json=payload, headers=headers)).status_code == 404


async def test_demo_params_come_from_dataset(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    body = (await client.get(f"{PROJECTS}/{project['id']}/params", headers=headers)).json()
    params = {p["key"]: p for p in body["params"]}
    assert params["area_m2"]["value"] == 20000
    assert params["area_m2"]["provenance"]["status"] == "default"
    assert params["area_m2"]["definition"]["unit"] == "м²"


async def test_blank_project_requires_own_values(client: AsyncClient) -> None:
    headers = await _auth(client)
    created = await client.post(
        PROJECTS, json={"name": "Свой склад", "object_type": "warehouse"}, headers=headers
    )
    project_id = created.json()["id"]
    params = {
        p["key"]: p
        for p in (await client.get(f"{PROJECTS}/{project_id}/params", headers=headers)).json()["params"]
    }
    assert params["area_m2"]["value"] is None
    assert params["area_m2"]["validation"]["status"] == "missing"
    report = (await client.get(f"{PROJECTS}/{project_id}/validation", headers=headers)).json()
    assert report["status"] == "errors"
    assert report["can_calculate"] is False
    assert (await client.get(f"{PROJECTS}/{project_id}/processes", headers=headers)).status_code == 409


async def test_param_edit_history_version_and_reset(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    base = f"{PROJECTS}/{project['id']}/params"

    edited = await client.patch(
        f"{base}/aisle_width_m", json={"value": 3200, "unit": "мм", "note": "замер"}, headers=headers
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["value"] == pytest.approx(3.2)
    assert edited.json()["provenance"]["status"] == "user"

    history = (await client.get(f"{base}/aisle_width_m/history", headers=headers)).json()["items"]
    assert history[0]["old_value"] == 2.8
    assert history[0]["note"] == "замер"
    assert (await client.get(f"{PROJECTS}/{project['id']}", headers=headers)).json()["version"] == 2

    reset = (await client.delete(f"{base}/aisle_width_m", headers=headers)).json()
    assert reset["value"] == 2.8
    assert reset["provenance"]["status"] == "default"


async def test_bulk_upsert_rejects_bad_type_and_unknown_key(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    base = f"{PROJECTS}/{project['id']}/params"
    bad = await client.put(base, json={"params": [{"key": "area_m2", "value": "много"}]}, headers=headers)
    assert bad.status_code == 422
    assert bad.json()["error_code"] == "PARAMS_INVALID"
    unknown = await client.put(base, json={"params": [{"key": "warp_drive", "value": 1}]}, headers=headers)
    assert unknown.json()["error_code"] == "PARAMS_INVALID"


async def test_range_warning_and_cross_check(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    base = f"{PROJECTS}/{project['id']}"
    await client.put(
        f"{base}/params",
        json={
            "params": [
                {"key": "pallets_in_per_day", "value": 12000},
                {"key": "robotized_area_m2", "value": 30000},
            ]
        },
        headers=headers,
    )
    report = (await client.get(f"{base}/validation", headers=headers)).json()
    codes = {issue["code"] for issue in report["issues"]}
    assert "RANGE_EXCEEDED" in codes
    assert any(code.startswith("CHECK_") for code in codes)


async def test_processes_show_where_the_money_is(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    body = (await client.get(f"{PROJECTS}/{project['id']}/processes", headers=headers)).json()
    by_key = {p["process_key"]: p for p in body["processes"]}
    pallets = by_key["pallet_transport"]
    assert pallets["demand_per_day"] == 2000
    assert pallets["peak_per_hour"] == pytest.approx(136.36, rel=1e-3)
    assert pallets["robotizable"] is True
    picking = by_key["order_picking"]
    assert picking["current"]["cost_rub_year"] == pytest.approx(156_240_000, rel=1e-3)
    assert picking["share_of_labor_cost"] > pallets["share_of_labor_cost"]


async def test_copy_keeps_params_and_audit_is_written(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    await client.patch(f"{PROJECTS}/{project['id']}/params/pickers", json={"value": 90}, headers=headers)
    copy = (
        await client.post(f"{PROJECTS}/{project['id']}/copy", json={"name": "Вариант Б"}, headers=headers)
    ).json()
    params = {
        p["key"]: p
        for p in (await client.get(f"{PROJECTS}/{copy['id']}/params", headers=headers)).json()["params"]
    }
    assert params["pickers"]["value"] == 90
    audit = (await client.get(f"{PROJECTS}/{project['id']}/audit", headers=headers)).json()
    assert {item["action"] for item in audit["items"]} >= {"create", "update"}


async def test_data_quality_counts_statuses(client: AsyncClient) -> None:
    headers = await _auth(client)
    project = await _demo(client, headers)
    await client.patch(f"{PROJECTS}/{project['id']}/params/pickers", json={"value": 90}, headers=headers)
    report = (await client.get(f"{PROJECTS}/{project['id']}/data-quality", headers=headers)).json()
    assert report["summary"]["counts"]["user"] == 1
    assert report["summary"]["score"] > 0


async def test_hospital_and_airport_demo_processes(client: AsyncClient) -> None:
    headers = await _auth(client)
    for object_type in ("hospital", "airport"):
        project = await _demo(client, headers, object_type)
        body = (await client.get(f"{PROJECTS}/{project['id']}/processes", headers=headers)).json()
        assert any(p["demand_per_day"] for p in body["processes"]), object_type
