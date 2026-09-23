from typing import Any

import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


async def _demo(client: AsyncClient, kind: str) -> tuple[str, dict[str, str]]:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    payload = {"name": kind, "object_type": kind, "init": {"mode": "demo", "demo_key": f"{kind}_demo_01"}}
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    return project["id"], headers


async def _set(client: AsyncClient, headers: dict[str, str], project_id: str, key: str, value: Any) -> None:
    url = f"/api/v1/projects/{project_id}/params/{key}"
    response = await client.patch(url, json={"key": key, "value": value}, headers=headers)
    assert response.status_code == 200, response.text


async def _candidates(
    client: AsyncClient, headers: dict[str, str], project_id: str, process: str
) -> list[dict]:
    body = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    return next(p for p in body["processes"] if p["process_key"] == process)["candidates"]


async def _calculate(
    client: AsyncClient, headers: dict[str, str], project_id: str, process: str, name: str
) -> dict[str, Any]:
    product = next(
        c for c in await _candidates(client, headers, project_id, process) if name in c["product"]["name"]
    )
    scenario = {
        "name": name,
        "kind": "purchase",
        "items": [{"process_key": process, "product_id": product["product"]["id"]}],
    }
    created = await client.post(f"/api/v1/projects/{project_id}/scenarios", json=scenario, headers=headers)
    calc = await client.post(f"/api/v1/scenarios/{created.json()['id']}/calculate", json={}, headers=headers)
    assert calc.status_code == 200, calc.text
    return calc.json()


def _capex(calc: dict[str, Any]) -> dict[str, float]:
    return {item["key"]: item["amount_rub"] for item in calc["capex"]["items"]}


def _cycle(calc: dict[str, Any]) -> dict[str, float]:
    return {c["name"]: c["seconds"] for c in calc["sizing"][0]["robot"]["cycle_components"]}


async def test_warehouse_without_wms_pays_for_one(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "warehouse")
    with_wms = _capex(await _calculate(client, headers, project_id, "pallet_transport", "H1500"))
    assert "capex_wms_implementation" not in with_wms
    await _set(client, headers, project_id, "has_wms", False)
    without = _capex(await _calculate(client, headers, project_id, "pallet_transport", "H1500"))
    assert without["capex_wms_implementation"] == pytest.approx(6_000_000)


async def test_racks_and_floor_decide_automated_storage(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "warehouse")
    shuttle = next(
        c
        for c in await _candidates(client, headers, project_id, "high_bay_storage")
        if "Shuttle" in c["product"]["name"]
    )
    codes = {r["code"] for r in shuttle["reasons"]}
    assert {"RACKS_FOR_AUTOMATED_STORAGE", "FLOOR_FLATNESS_FOR_AUTOMATED_STORAGE"} <= codes
    await _set(client, headers, project_id, "storage_type", "pallet_shuttle")
    await _set(client, headers, project_id, "floor_flatness_mm", 2)
    shuttle = next(
        c
        for c in await _candidates(client, headers, project_id, "high_bay_storage")
        if "Shuttle" in c["product"]["name"]
    )
    assert not {"RACKS_FOR_AUTOMATED_STORAGE", "FLOOR_FLATNESS_FOR_AUTOMATED_STORAGE"} & {
        r["code"] for r in shuttle["reasons"]
    }


async def test_pallet_wider_than_the_aisle_is_an_input_error(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "warehouse")
    await _set(client, headers, project_id, "pallet_dims_mm", "1200×2800×1600")
    report = (await client.get(f"/api/v1/projects/{project_id}/validation", headers=headers)).json()
    assert "CHECK_PALLET_FITS_WORKING_AISLE" in {issue["code"] for issue in report["issues"]}


async def test_too_little_power_for_the_chargers_is_a_risk(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "warehouse")
    await _set(client, headers, project_id, "power_kw", 5)
    calc = await _calculate(client, headers, project_id, "pallet_transport", "H1500")
    assert "CHARGING_POWER" in {risk["code"] for risk in calc["risks"]}


async def test_apron_admission_is_checked_only_when_required(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "airport")
    tractor = next(
        c
        for c in await _candidates(client, headers, project_id, "baggage_handling")
        if c["status"] != "excluded"
    )
    specs = {m["spec_key"] for m in tractor["missing_data"]}
    assert {"airside_certified", "ip_rating"} <= specs
    await _set(client, headers, project_id, "airside_certification", False)
    await _set(client, headers, project_id, "has_open_air_zones", False)
    tractor = next(
        c
        for c in await _candidates(client, headers, project_id, "baggage_handling")
        if c["status"] != "excluded"
    )
    assert not {"airside_certified", "ip_rating"} & {m["spec_key"] for m in tractor["missing_data"]}


async def test_airport_access_control_costs_per_zone(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "airport")
    capex = _capex(await _calculate(client, headers, project_id, "cart_and_waste_logistics", "RoboCV"))
    assert capex["capex_access_control"] == pytest.approx(4 * 250_000)


async def test_hospital_lifts_floors_and_disinfection(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "hospital")
    meals = await _calculate(client, headers, project_id, "meal_delivery", "H1500")
    lift = "Поездка на лифте (ожидание, вход, этажи)"
    assert _cycle(meals)[lift] == pytest.approx(120)
    capex = _capex(meals)
    assert capex["capex_elevators"] == pytest.approx(4 * 800_000)
    assert capex["capex_access_control"] == pytest.approx(22 * 250_000)
    waste = _cycle(await _calculate(client, headers, project_id, "waste_transport", "H1500"))
    assert waste["Обеззараживание робота после рейса"] == pytest.approx(300)

    await _set(client, headers, project_id, "floors", 18)
    await _set(client, headers, project_id, "elevator_control", "yes")
    await _set(client, headers, project_id, "robot_disinfection", False)
    meals = await _calculate(client, headers, project_id, "meal_delivery", "H1500")
    assert _cycle(meals)[lift] == pytest.approx(165)
    assert _capex(meals)["capex_elevators"] == pytest.approx(4 * 150_000)
    waste = _cycle(await _calculate(client, headers, project_id, "waste_transport", "H1500"))
    assert waste.get("Обеззараживание робота после рейса", 0) == 0


async def test_a_trip_longer_than_the_delivery_norm_is_a_risk(client: AsyncClient) -> None:
    project_id, headers = await _demo(client, "hospital")
    await _set(client, headers, project_id, "meal_delivery_norm_min", 2)
    calc = await _calculate(client, headers, project_id, "meal_delivery", "H1500")
    assert "LEAD_TIME_EXCEEDED" in {risk["code"] for risk in calc["risks"]}
