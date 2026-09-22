import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def _project(
    client: AsyncClient, mode: str = "demo", object_type: str = "warehouse"
) -> tuple[str, dict]:
    headers = bearer((await login(client, "user@roboscope.demo"))["access"])
    init = {"mode": mode, "demo_key": f"{object_type}_demo_01"} if mode == "demo" else {"mode": mode}
    payload = {"name": "Объект", "object_type": object_type, "init": init}
    response = await client.post("/api/v1/projects", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"], headers


async def _pallet_scenario(client: AsyncClient, headers: dict[str, str], project_id: str) -> str:
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    candidates = next(p for p in body["processes"] if p["process_key"] == "pallet_transport")["candidates"]
    product = next(c for c in candidates if "H1500" in c["product"]["name"])["product"]["id"]
    payload = {
        "name": "Покупка",
        "kind": "purchase",
        "items": [{"process_key": "pallet_transport", "product_id": product}],
    }
    response = await client.post(f"/api/v1/projects/{project_id}/scenarios", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def test_demo_warehouse_comes_with_a_generated_layout(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    response = await client.get(f"/api/v1/projects/{project_id}/layout", headers=headers)
    assert response.status_code == 200, response.text
    layout = response.json()
    assert layout["generated"]
    assert layout["template"] == "warehouse_u_flow"
    assert layout["version"] == 1
    assert not layout["params_changed"]
    stats = layout["stats"]
    assert 60 < stats["avg_route_m"]["dock_in_to_storage"] < 130
    assert stats["rack_slots_total"] > 0
    assert stats["docks_in"] >= 1
    assert {e["from"] for e in layout["edges"]} <= {n["id"] for n in layout["nodes"]}
    rendered = {step["key"]: step["formula_rendered"] for step in layout["derivation"]}
    assert rendered["rack_levels"].endswith("= 5 шт")
    project = (await client.get(f"/api/v1/projects/{project_id}", headers=headers)).json()
    assert project["version"] == 1


async def test_blank_project_has_no_layout_until_generated(client: AsyncClient) -> None:
    project_id, headers = await _project(client, mode="blank")
    missing = await client.get(f"/api/v1/projects/{project_id}/layout", headers=headers)
    assert missing.status_code == 404
    generated = await client.post(f"/api/v1/projects/{project_id}/layout/generate", headers=headers)
    assert generated.status_code == 409
    assert generated.json()["error_code"] == "PARAMS_INVALID"
    assert any(d["field"] == "params.area_m2" for d in generated.json()["details"])


async def test_layout_routes_feed_the_calculation_trace(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    scenario_id = await _pallet_scenario(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    assert run["versions"]["layout_version"] == 1
    trace = (await client.get(f"/api/v1/calculations/{run['id']}/trace", headers=headers)).json()
    route = next(i for i in trace["items"] if i["metric_key"] == "pallet_transport.route_length_m")
    layout_inputs = [q for q in route["inputs"] if q["kind"] == "layout"]
    assert {q["key"] for q in layout_inputs} >= {
        "layout_route_dock_in_to_storage_m",
        "layout_route_storage_to_dock_out_m",
    }
    assert layout_inputs[0]["provenance"]["status"] == "derived"
    assert route["value"] < 130
    assert trace["undocumented_constants"] == 0


async def test_regenerating_the_layout_makes_calculations_stale(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    scenario_id = await _pallet_scenario(client, headers, project_id)
    run = (await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)).json()
    payload = {"template": "warehouse_flow_through", "overrides": {"docks_in": 4, "chargers": 6}}
    response = await client.post(
        f"/api/v1/projects/{project_id}/layout/generate", json=payload, headers=headers
    )
    assert response.status_code == 200, response.text
    layout = response.json()
    assert layout["version"] == 2
    assert layout["template"] == "warehouse_flow_through"
    assert (layout["stats"]["docks_in"], layout["stats"]["chargers"]) == (4, 6)
    stored = (await client.get(f"/api/v1/calculations/{run['id']}", headers=headers)).json()
    assert stored["status"] == "stale"
    bad = await client.post(
        f"/api/v1/projects/{project_id}/layout/generate", json={"overrides": {"robots": 3}}, headers=headers
    )
    assert bad.status_code == 409


async def test_param_change_flags_the_layout(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    url = f"/api/v1/projects/{project_id}/params/ceiling_height_m"
    response = await client.patch(url, json={"value": 12}, headers=headers)
    assert response.status_code == 200, response.text
    layout = (await client.get(f"/api/v1/projects/{project_id}/layout", headers=headers)).json()
    assert layout["params_changed"]


async def test_editor_changes_are_validated_and_recomputed(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    layout = (await client.get(f"/api/v1/projects/{project_id}/layout", headers=headers)).json()
    dangling = [*layout["edges"], {**layout["edges"][0], "id": "bad", "to": "nowhere"}]
    rejected = await client.put(
        f"/api/v1/projects/{project_id}/layout", json={"edges": dangling}, headers=headers
    )
    assert rejected.status_code == 422
    assert any(d["field"] == "edges.bad" for d in rejected.json()["details"])

    dock = next(n for n in layout["nodes"] if n["kind"] == "dock_in")
    moved = [{**n, "x": n["x"] + 20} if n["id"] == dock["id"] else n for n in layout["nodes"]]
    response = await client.put(
        f"/api/v1/projects/{project_id}/layout",
        json={"nodes": moved, "background_scale_m_per_px": 0.05},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    edited = response.json()
    assert not edited["generated"]
    assert edited["version"] == 2
    assert edited["background_scale_m_per_px"] == 0.05
    link = next(e for e in edited["edges"] if dock["id"] in (e["from"], e["to"]))
    assert link["length_m"] > 20
    assert any("вручную" in w for w in edited["warnings"])


async def test_background_upload_and_download(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    url = f"/api/v1/projects/{project_id}/layout/background"
    wrong = await client.post(url, files={"file": ("plan.txt", b"text", "text/plain")}, headers=headers)
    assert wrong.status_code == 415
    response = await client.post(
        url, files={"file": ("plan.png", PNG, "image/png")}, data={"scale_m_per_px": "0.1"}, headers=headers
    )
    assert response.status_code == 200, response.text
    image = response.json()["background_image"]
    assert image["url"] == url
    assert image["size_bytes"] == len(PNG)
    downloaded = await client.get(url, headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.content == PNG
    assert downloaded.headers["content-type"] == "image/png"


async def test_copy_keeps_the_layout_and_other_types_are_not_supported(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    copy = await client.post(f"/api/v1/projects/{project_id}/copy", json={"name": "Копия"}, headers=headers)
    assert copy.status_code == 201, copy.text
    copied = (await client.get(f"/api/v1/projects/{copy.json()['id']}/layout", headers=headers)).json()
    assert copied["stats"]["rack_slots_total"] > 0
    assert not copied["params_changed"]

    hospital_id, _ = await _project(client, object_type="hospital")
    response = await client.post(f"/api/v1/projects/{hospital_id}/layout/generate", headers=headers)
    assert response.status_code == 409
    assert response.json()["error_code"] == "OBJECT_TYPE_NOT_SUPPORTED"


async def test_foreign_user_cannot_read_the_layout(client: AsyncClient) -> None:
    project_id, _ = await _project(client)
    stranger = bearer((await login(client, "vendor@roboscope.demo"))["access"])
    response = await client.get(f"/api/v1/projects/{project_id}/layout", headers=stranger)
    assert response.status_code in {403, 404}


async def test_candidate_estimate_uses_layout_routes(client: AsyncClient) -> None:
    project_id, headers = await _project(client)
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    candidates = next(p for p in body["processes"] if p["process_key"] == "pallet_transport")["candidates"]
    h1500 = next(c for c in candidates if "H1500" in c["product"]["name"])["estimate"]
    # With the 200 m default route the same robot needs ~2× the fleet and does not pay back in 10 years.
    assert h1500["payback_years"] < 10
