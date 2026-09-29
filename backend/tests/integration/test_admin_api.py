from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
PRODUCTS = "/api/v1/catalog/products"
SOURCE = {"kind": "vendor_site", "title": "Сайт производителя", "url": "https://example.com/robot"}


@pytest.fixture(autouse=True)
async def restore_seeded_tables(settings: Settings) -> AsyncIterator[None]:
    """Catalog and norms survive between tests (conftest SEEDED_TABLES): undo what the admin changed."""
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        version = await conn.scalar(text("SELECT version FROM data_versions WHERE key = 'catalog'"))
    yield
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM products WHERE managed_by_seed = false"))
        await conn.execute(text("DELETE FROM norm_sets WHERE published_by <> 'system'"))
        await conn.execute(text("UPDATE norm_sets SET is_current = (version = 'v1')"))
        await conn.execute(text("DELETE FROM sources WHERE key LIKE 'admin:%'"))
        await conn.execute(
            text("UPDATE data_versions SET version = :v WHERE key = 'catalog'"), {"v": version}
        )
    await engine.dispose()


async def _admin(client: AsyncClient) -> dict[str, str]:
    return bearer((await login(client, "admin@robomera.demo"))["access"])


def _product(name: str = "Тестовый AMR-900", price: float = 2_500_000) -> dict:
    return {
        "name": name,
        "manufacturer_name": "Тестовые роботы",
        "solution_type": "amr_transport",
        "status": "operation",
        "trl": 8,
        "description": "Платформа для перевозки паллет по складу",
        "object_types": ["warehouse"],
        "processes": ["pallet_transport"],
        "badges": ["tested_fcbas", "domestic"],
        "offers": [
            {
                "industry": "Торговля и услуги",
                "scenario": "Внутрискладская логистика",
                "price": {"amount_rub": price},
                "source": SOURCE,
            }
        ],
    }


async def _create(client: AsyncClient, headers: dict[str, str], **kwargs: object) -> dict:
    response = await client.post(f"{ADMIN}/catalog/products", json=_product(**kwargs), headers=headers)  # type: ignore[arg-type]
    assert response.status_code == 201, response.text
    return response.json()


async def test_plain_user_cannot_use_admin_endpoints(client: AsyncClient) -> None:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    assert (await client.get(f"{ADMIN}/users", headers=headers)).status_code == 403
    assert (await client.get(f"{ADMIN}/analytics/overview", headers=headers)).status_code == 403
    created = await client.post(f"{ADMIN}/catalog/products", json=_product(), headers=headers)
    assert created.status_code == 403
    assert (await client.get(f"{ADMIN}/users")).status_code == 401


async def test_create_product_derives_price_badges_and_version(client: AsyncClient) -> None:
    headers = await _admin(client)
    before = (await client.get("/api/v1/version")).json()
    body = await _create(client, headers)
    assert body["price_from"]["amount_rub"] == 2_500_000
    assert body["offers_count"] == 1
    assert set(body["badges"]) == {"tested_fcbas", "domestic"}
    assert 0 < body["completeness"] < 1
    assert body["offers"][0]["source"]["title"] == "Сайт производителя"
    assert body["manufacturer"]["name"] == "Тестовые роботы"
    after = (await client.get("/api/v1/version")).json()
    assert after["catalog_version"] != before["catalog_version"]
    found = (await client.get(PRODUCTS, params={"q": "AMR-900"})).json()
    assert [item["id"] for item in found["items"]] == [body["id"]]


async def test_create_product_rejects_unknown_references(client: AsyncClient) -> None:
    headers = await _admin(client)
    bad_type = {**_product(), "solution_type": "teleporter"}
    response = await client.post(f"{ADMIN}/catalog/products", json=bad_type, headers=headers)
    assert response.status_code == 422
    assert "teleporter" in response.json()["detail"]
    bad_industry = _product()
    bad_industry["offers"][0]["industry"] = "Космос"
    response = await client.post(f"{ADMIN}/catalog/products", json=bad_industry, headers=headers)
    assert response.status_code == 422
    bad_process = {**_product(), "processes": ["no_such_process"]}
    response = await client.post(f"{ADMIN}/catalog/products", json=bad_process, headers=headers)
    assert response.status_code == 422


async def test_update_product_keeps_offer_and_changes_price(client: AsyncClient) -> None:
    headers = await _admin(client)
    created = await _create(client, headers)
    payload = _product(name="Тестовый AMR-900 v2", price=1_900_000)
    payload["offers"][0].pop("source")
    payload["offers"].append(
        {"industry": "transport_logistics", "scenario": "Кросс-докинг", "price": {"amount_rub": 2_100_000}}
    )
    response = await client.patch(f"{ADMIN}/catalog/products/{created['id']}", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Тестовый AMR-900 v2"
    assert body["price_from"]["amount_rub"] == 1_900_000
    assert body["offers_count"] == 2
    kept = next(o for o in body["offers"] if o["scenario"] == "Внутрискладская логистика")
    assert kept["id"] == created["offers"][0]["id"]
    assert kept["source"]["title"] == "Сайт производителя"


async def test_hidden_product_leaves_catalog_but_card_stays(client: AsyncClient) -> None:
    headers = await _admin(client)
    created = await _create(client, headers)
    url = f"{ADMIN}/catalog/products/{created['id']}"
    assert (await client.delete(url, headers=headers)).status_code == 204
    found = (await client.get(PRODUCTS, params={"q": "AMR-900"})).json()
    assert found["total"] == 0
    assert (await client.get(f"{PRODUCTS}/{created['id']}")).status_code == 200
    assert (await client.delete(url, headers=headers)).status_code == 404
    assert (await client.patch(url, json=_product(), headers=headers)).status_code == 404


async def test_upsert_specs_sets_primary_value_and_checks_types(client: AsyncClient) -> None:
    headers = await _admin(client)
    created = await _create(client, headers)
    url = f"{ADMIN}/catalog/products/{created['id']}/specs"
    specs = [
        {"key": "payload_kg", "value": 1500, "source": SOURCE},
        {"key": "max_speed_mps", "value": 1.5, "status": "vendor_claim", "source": SOURCE},
    ]
    response = await client.put(url, json={"specs": specs}, headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    payload = next(s for s in body["specs"] if s["key"] == "payload_kg")
    assert payload["value"] == 1500
    assert payload["provenance"]["status"] == "confirmed"
    assert payload["provenance"]["source"]["url"] == SOURCE["url"]
    assert body["completeness"] > created["completeness"]
    again = await client.put(url, json={"specs": [{**specs[0], "value": 1200}]}, headers=headers)
    values = [s["value"] for s in again.json()["specs"] if s["key"] == "payload_kg"]
    assert values == [1200]
    wrong_type = await client.put(url, json={"specs": [{**specs[0], "value": "много"}]}, headers=headers)
    assert wrong_type.status_code == 422
    unknown = await client.put(url, json={"specs": [{**specs[0], "key": "warp_speed"}]}, headers=headers)
    assert unknown.status_code == 422


async def _ranged_norm(client: AsyncClient) -> dict:
    norms = (await client.get("/api/v1/norms")).json()["items"]
    return next(n for n in norms if n.get("range") and n["range"]["min"] is not None and n["range"]["max"])


async def test_publish_norm_set_bumps_version_and_becomes_current(client: AsyncClient) -> None:
    headers = await _admin(client)
    norm = await _ranged_norm(client)
    value = (norm["range"]["min"] + norm["range"]["max"]) / 2
    change = {"key": norm["key"], "value": value, "rationale": "Проверка публикации", "source": SOURCE}
    payload = {"notes": "Тестовая версия", "changes": [change]}
    response = await client.post(f"{ADMIN}/norm-sets", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["version"] == "v1.1"
    assert body["is_current"]
    assert body["published_by"] == "admin@robomera.demo"
    current = (await client.get("/api/v1/norms")).json()
    assert current["version"] == "v1.1"
    updated = next(n for n in current["items"] if n["key"] == norm["key"])
    assert updated["value"] == pytest.approx(value)
    assert updated["source"]["title"] == SOURCE["title"]
    sets = (await client.get("/api/v1/norm-sets")).json()["items"]
    assert [s["version"] for s in sets if s["is_current"]] == ["v1.1"]
    second = await client.post(f"{ADMIN}/norm-sets", json={"notes": "Ещё", "changes": []}, headers=headers)
    assert second.json()["version"] == "v1.2"


async def test_publish_norm_set_rejects_out_of_range_and_unknown(client: AsyncClient) -> None:
    headers = await _admin(client)
    norm = await _ranged_norm(client)
    too_big = {"notes": "x", "changes": [{"key": norm["key"], "value": norm["range"]["max"] * 10 + 1}]}
    response = await client.post(f"{ADMIN}/norm-sets", json=too_big, headers=headers)
    assert response.status_code == 422
    assert "диапазон" in response.json()["detail"]
    unknown = {"notes": "x", "changes": [{"key": "no_such_norm", "value": 1}]}
    assert (await client.post(f"{ADMIN}/norm-sets", json=unknown, headers=headers)).status_code == 422
    assert (await client.get("/api/v1/norms")).json()["version"] == "v1"


async def _calculated(client: AsyncClient) -> tuple[str, dict[str, str]]:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    project = {
        "name": "Склад",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project_id = (await client.post("/api/v1/projects", json=project, headers=headers)).json()["id"]
    matching = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)).json()
    candidates = next(p for p in matching["processes"] if p["process_key"] == "pallet_transport")[
        "candidates"
    ]
    product_id = next(c for c in candidates if "H1500" in c["product"]["name"])["product"]["id"]
    scenario = {
        "name": "Покупка",
        "kind": "purchase",
        "items": [{"process_key": "pallet_transport", "product_id": product_id}],
    }
    created = await client.post(f"/api/v1/projects/{project_id}/scenarios", json=scenario, headers=headers)
    run = (await client.post(f"/api/v1/scenarios/{created.json()['id']}/calculate", headers=headers)).json()
    return run["id"], headers


async def test_catalog_and_norm_changes_make_calculations_stale(client: AsyncClient) -> None:
    run_id, user_headers = await _calculated(client)
    url = f"/api/v1/calculations/{run_id}"
    assert (await client.get(url, headers=user_headers)).json()["status"] == "fresh"
    admin = await _admin(client)
    await _create(client, admin)
    assert (await client.get(url, headers=user_headers)).json()["status"] == "stale"


async def test_norm_publication_makes_calculations_stale(client: AsyncClient) -> None:
    run_id, user_headers = await _calculated(client)
    admin = await _admin(client)
    await client.post(f"{ADMIN}/norm-sets", json={"notes": "Без изменений", "changes": []}, headers=admin)
    status = (await client.get(f"/api/v1/calculations/{run_id}", headers=user_headers)).json()["status"]
    assert status == "stale"


async def test_list_and_update_users(client: AsyncClient) -> None:
    headers = await _admin(client)
    body = (await client.get(f"{ADMIN}/users", params={"q": "user@"}, headers=headers)).json()
    assert [u["email"] for u in body["items"]] == ["user@robomera.demo"]
    admins = (await client.get(f"{ADMIN}/users", params={"role": "admin"}, headers=headers)).json()
    assert {u["role"] for u in admins["items"]} == {"admin"}
    user_tokens = await login(client, "user@robomera.demo")
    target = body["items"][0]["id"]
    response = await client.patch(f"{ADMIN}/users/{target}", json={"role": "vendor"}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "vendor"
    assert (await client.get("/api/v1/me", headers=bearer(user_tokens["access"]))).status_code == 401
    blocked = await client.patch(f"{ADMIN}/users/{target}", json={"is_active": False}, headers=headers)
    assert blocked.json()["is_active"] is False
    relogin = await client.post(
        "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
    )
    assert relogin.status_code in {401, 403}


async def test_admin_cannot_demote_or_block_self(client: AsyncClient) -> None:
    headers = await _admin(client)
    me = (await client.get("/api/v1/me", headers=headers)).json()
    url = f"{ADMIN}/users/{me['id']}"
    assert (await client.patch(url, json={"role": "user"}, headers=headers)).status_code == 422
    assert (await client.patch(url, json={"is_active": False}, headers=headers)).status_code == 422
    assert (await client.patch(url, json={"role": "admin"}, headers=headers)).status_code == 200
    missing = f"{ADMIN}/users/00000000-0000-0000-0000-000000000000"
    assert (await client.patch(missing, json={"is_active": True}, headers=headers)).status_code == 404


async def test_analytics_overview_counts_projects_and_calculations(client: AsyncClient) -> None:
    await _calculated(client)
    headers = await _admin(client)
    body = (await client.get(f"{ADMIN}/analytics/overview", headers=headers)).json()
    assert body["projects_by_object_type"] == {"warehouse": 1}
    assert body["calculations_count"] >= 1
    assert body["top_products_in_scenarios"][0]["name"].find("H1500") >= 0
    assert sum(body["demand_by_industry"].values()) == 1
    assert body["rfq_count"] == 0
    assert all(gap["object_type"] == "warehouse" for gap in body["catalog_gaps"])
    past = (
        await client.get(
            f"{ADMIN}/analytics/overview", params={"from": "2020-01-01", "to": "2020-12-31"}, headers=headers
        )
    ).json()
    assert past["projects_by_object_type"] == {}
    assert past["period"] == {"from": "2020-01-01", "to": "2020-12-31"}
