from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from app.main import create_app
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
DEFAULTS = f"{ADMIN}/parameter-defaults"
SOURCE = {"kind": "open_source", "title": "Росстат, зарплаты 2026", "url": "https://rosstat.gov.ru/labor"}
SALARY = "forklift_salary_rub_month"
TEAM_SOURCE_KEY = "norms:team"


@pytest.fixture(autouse=True)
async def restore_reference(settings: Settings) -> AsyncIterator[None]:
    """Defaults and sources are seeded: drop what the admin set, the next seed run restores the rest."""
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        team = (
            await conn.execute(
                text("SELECT title, url, retrieved_at, note FROM sources WHERE key = :k"),
                {"k": TEAM_SOURCE_KEY},
            )
        ).one()
    yield
    async with engine.begin() as conn:
        admin_sources = "SELECT id FROM sources WHERE key LIKE 'admin:%'"
        detach = (
            f"UPDATE parameter_defs SET default_source_id = NULL WHERE default_source_id IN ({admin_sources})"
        )
        await conn.execute(text(detach))
        await conn.execute(text("DELETE FROM sources WHERE key LIKE 'admin:%'"))
        await conn.execute(
            text("UPDATE sources SET title = :t, url = :u, retrieved_at = :r, note = :n WHERE key = :k"),
            {"t": team.title, "u": team.url, "r": team.retrieved_at, "n": team.note, "k": TEAM_SOURCE_KEY},
        )
    await engine.dispose()


async def _admin(client: AsyncClient) -> dict[str, str]:
    return bearer((await login(client, "admin@robomera.demo"))["access"])


async def _demo_calculation(client: AsyncClient) -> tuple[str, dict, dict[str, str]]:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    payload = {
        "name": "Склад",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    matching = (await client.get(f"/api/v1/projects/{project['id']}/matching", headers=headers)).json()
    candidates = next(p for p in matching["processes"] if p["process_key"] == "pallet_transport")[
        "candidates"
    ]
    product = next(c for c in candidates if "H1500" in c["product"]["name"])["product"]["id"]
    scenario = {
        "name": "Покупка",
        "kind": "purchase",
        "items": [{"process_key": "pallet_transport", "product_id": product}],
    }
    created = await client.post(f"/api/v1/projects/{project['id']}/scenarios", json=scenario, headers=headers)
    run = (await client.post(f"/api/v1/scenarios/{created.json()['id']}/calculate", headers=headers)).json()
    return project["id"], run, headers


def _param(body: dict, key: str) -> dict:
    return next(item for item in body["items"] if item["key"] == key)


async def test_defaults_list_shows_usage_and_blank_rule(client: AsyncClient) -> None:
    headers = await _admin(client)
    before = (await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json()
    salary = _param(before, SALARY)
    assert salary["default"]["provenance"]["status"] == "default"
    assert salary["default"]["provenance"]["source"]["title"]
    assert salary["group_name"]
    await _demo_calculation(client)
    after = (await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json()
    salary = _param(after, SALARY)
    assert salary["projects_total"] == before["items"][0]["projects_total"] + 1
    assert salary["projects_using_default"] >= 1
    required_demo = [
        i for i in after["items"] if i["required"] and i["default"] and not i["applies_to_blank"]
    ]
    assert all(i["default"]["provenance"]["status"] == "default" for i in required_demo)
    user = bearer((await login(client, "user@robomera.demo"))["access"])
    assert (await client.get(f"{DEFAULTS}/warehouse", headers=user)).status_code == 403
    assert (await client.get(f"{DEFAULTS}/spaceport", headers=headers)).status_code == 422


async def test_new_default_restamps_projects_and_makes_calculation_stale(client: AsyncClient) -> None:
    project_id, run, user = await _demo_calculation(client)
    headers = await _admin(client)
    salary = _param((await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json(), SALARY)
    value = salary["default"]["value"] + 10_000
    payload = {"value": value, "unit": salary["unit"], "source": SOURCE, "rationale": "Рынок труда 2026"}
    response = await client.put(f"{DEFAULTS}/warehouse/{SALARY}", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["projects_restamped"] >= 1
    default = body["parameter"]["default"]
    assert default["value"] == value
    assert default["provenance"]["status"] == "default"
    assert default["provenance"]["source"]["url"] == SOURCE["url"]
    assert default["provenance"]["note"] == "Рынок труда 2026"
    assert default["provenance"]["changed_by"] == "admin@robomera.demo"

    stale = (await client.get(f"/api/v1/calculations/{run['id']}", headers=user)).json()
    assert stale["status"] == "stale"
    assert stale["versions"]["inputs_hash"] == run["versions"]["inputs_hash"]
    rerun = (await client.post(f"/api/v1/calculations/{run['id']}/rerun", headers=user)).json()
    causes = [cause for diff in rerun["diff"] for cause in diff["causes"]]
    assert any("Параметр" in cause for cause in causes)
    params = (await client.get(f"/api/v1/projects/{project_id}/params", headers=user)).json()
    assert _param_value(params, SALARY) == value
    audit = (await client.get(f"/api/v1/projects/{project_id}/audit", headers=user)).json()["items"]
    event = next(e for e in audit if e["entity"] == f"project_param:{SALARY}")
    assert event["after"] == {"value": value}
    assert "по умолчанию" in event["note"]

    history = (await client.get(f"{DEFAULTS}/warehouse/{SALARY}/history", headers=headers)).json()
    assert history["total"] == 1
    assert history["items"][0]["before"]["value"] == salary["default"]["value"]
    assert history["items"][0]["after"]["source"] == SOURCE["title"]


def _param_value(body: dict, key: str) -> object:
    return next(param["value"] for param in body["params"] if param["key"] == key)


async def test_same_value_with_new_source_keeps_calculations_fresh(client: AsyncClient) -> None:
    _, run, user = await _demo_calculation(client)
    headers = await _admin(client)
    salary = _param((await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json(), SALARY)
    payload = {"value": salary["default"]["value"], "source": SOURCE, "rationale": "Подтверждено Росстатом"}
    body = (await client.put(f"{DEFAULTS}/warehouse/{SALARY}", json=payload, headers=headers)).json()
    assert body["projects_restamped"] == 0
    fresh = (await client.get(f"/api/v1/calculations/{run['id']}", headers=user)).json()
    assert fresh["status"] == "fresh"


async def test_default_is_validated_against_the_parameter(client: AsyncClient) -> None:
    headers = await _admin(client)
    items = (await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json()["items"]
    ranged = next(i for i in items if i["type"] == "number" and i["max"] is not None and i["min"] is not None)
    url = f"{DEFAULTS}/warehouse/{ranged['key']}"
    base = {"source": SOURCE, "rationale": "Проверка"}
    too_big = await client.put(url, json={**base, "value": ranged["max"] * 10 + 1}, headers=headers)
    assert too_big.status_code == 422
    assert "диапазон" in too_big.json()["detail"]
    text_value = await client.put(url, json={**base, "value": "много"}, headers=headers)
    assert text_value.status_code == 422
    wrong_unit = await client.put(
        url, json={**base, "value": ranged["min"], "unit": "попугаи"}, headers=headers
    )
    assert wrong_unit.status_code == 422
    listed = next(i for i in items if i["type"] == "enum")
    bad_enum = await client.put(
        f"{DEFAULTS}/warehouse/{listed['key']}", json={**base, "value": "нет такого"}, headers=headers
    )
    assert bad_enum.status_code == 422
    missing = await client.put(
        f"{DEFAULTS}/warehouse/no_such_param", json={**base, "value": 1}, headers=headers
    )
    assert missing.status_code == 404
    no_rationale = await client.put(url, json={"source": SOURCE, "value": ranged["min"]}, headers=headers)
    assert no_rationale.status_code == 422


async def test_seed_keeps_admin_default_and_edited_source(client: AsyncClient, settings: Settings) -> None:
    headers = await _admin(client)
    salary = _param((await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json(), SALARY)
    value = salary["default"]["value"] + 5_000
    payload = {"value": value, "source": SOURCE, "rationale": "Рынок труда 2026"}
    assert (
        await client.put(f"{DEFAULTS}/warehouse/{SALARY}", json=payload, headers=headers)
    ).status_code == 200
    team = await _team_source(client, headers)
    edit = {"title": "Допущение команды (перепроверено)", "retrieved_at": "2026-09-28"}
    assert (
        await client.patch(f"{ADMIN}/sources/{team['id']}", json=edit, headers=headers)
    ).status_code == 200

    restarted = create_app(settings)
    async with restarted.router.lifespan_context(restarted):
        pass

    salary = _param((await client.get(f"{DEFAULTS}/warehouse", headers=headers)).json(), SALARY)
    assert salary["default"]["value"] == value
    team = await _team_source(client, headers)
    assert team["title"] == edit["title"]


async def _team_source(client: AsyncClient, headers: dict[str, str]) -> dict:
    """The team assumption behind the norms (seed key norms:team): the only team source that norms cite."""
    body = (await client.get(f"{ADMIN}/sources", params={"kind": "team_assumption"}, headers=headers)).json()
    return next(item for item in body["items"] if item["usage"]["norms"] > 0)


async def test_sources_registry_counts_usage_and_filters(client: AsyncClient) -> None:
    headers = await _admin(client)
    body = (await client.get(f"{ADMIN}/sources", headers=headers)).json()
    assert body["stale_after_months"] == 12
    assert body["total"] >= len(body["items"]) > 0
    assert all(item["usage"]["total"] > 0 for item in body["items"])
    totals = [item["usage"]["total"] for item in body["items"]]
    assert totals == sorted(totals, reverse=True)
    assert sum(body["freshness_counts"].values()) == body["total"]
    catalog = (
        await client.get(f"{ADMIN}/sources", params={"kind": "organizer_catalog"}, headers=headers)
    ).json()
    assert catalog["items"]
    assert catalog["items"][0]["usage"]["offers"] > 0
    found = (await client.get(f"{ADMIN}/sources", params={"q": "catalog_export_v4"}, headers=headers)).json()
    assert any("catalog_export_v4" in item["title"] for item in found["items"])
    everything = (
        await client.get(f"{ADMIN}/sources", params={"include_unused": True}, headers=headers)
    ).json()
    assert everything["total"] >= body["total"]
    user = bearer((await login(client, "user@robomera.demo"))["access"])
    assert (await client.get(f"{ADMIN}/sources", headers=user)).status_code == 403


async def test_old_source_is_stale_and_edit_is_validated(client: AsyncClient) -> None:
    headers = await _admin(client)
    team = await _team_source(client, headers)
    url = f"{ADMIN}/sources/{team['id']}"
    old = (datetime.now(UTC).date() - timedelta(days=3 * 365)).isoformat()
    response = await client.patch(url, json={"retrieved_at": old, "note": "Проверить"}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["freshness"] == "stale"
    assert body["note"] == "Проверить"
    assert body["title"] == team["title"]
    assert body["usage"] == team["usage"]
    stale = (await client.get(f"{ADMIN}/sources", params={"freshness": "stale"}, headers=headers)).json()
    assert team["id"] in {item["id"] for item in stale["items"]}
    assert all(
        date.fromisoformat(i["retrieved_at"]) < date.fromisoformat(stale["stale_before"])
        for i in stale["items"]
    )
    future = (datetime.now(UTC).date() + timedelta(days=2)).isoformat()
    assert (await client.patch(url, json={"retrieved_at": future}, headers=headers)).status_code == 422
    assert (await client.patch(url, json={"url": "ftp://example.com"}, headers=headers)).status_code == 422
    assert (await client.patch(url, json={"title": None}, headers=headers)).status_code == 422
    missing = f"{ADMIN}/sources/00000000-0000-0000-0000-000000000000"
    assert (await client.patch(missing, json={"note": "x"}, headers=headers)).status_code == 404
