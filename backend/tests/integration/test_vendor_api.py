from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from app.seeds.users import DEMO_VENDOR_MANUFACTURER
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

ADMIN = "/api/v1/admin"
VENDOR = "/api/v1/vendor"
SOURCE = {"kind": "vendor_site", "title": "Паспорт изделия", "url": "https://example.com/passport.pdf"}


@pytest.fixture(autouse=True)
async def restore_seeded_tables(settings: Settings) -> AsyncIterator[None]:
    """Approved proposals write to the seeded catalog: undo it like the admin tests do."""
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        version = await conn.scalar(text("SELECT version FROM data_versions WHERE key = 'catalog'"))
    yield
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM products WHERE managed_by_seed = false"))
        await conn.execute(text("DELETE FROM sources WHERE key LIKE 'admin:%'"))
        if version is not None:
            await conn.execute(
                text("UPDATE data_versions SET version = :v WHERE key = 'catalog'"), {"v": version}
            )
    await engine.dispose()


async def _headers(client: AsyncClient, email: str) -> dict[str, str]:
    return bearer((await login(client, email))["access"])


def _card(name: str, manufacturer: str = DEMO_VENDOR_MANUFACTURER, price: float = 3_100_000) -> dict:
    return {
        "name": name,
        "manufacturer_name": manufacturer,
        "solution_type": "amr_transport",
        "status": "operation",
        "trl": 8,
        "description": "Паллетный AMR для склада",
        "object_types": ["warehouse"],
        "processes": ["pallet_transport"],
        "badges": ["tested_fcbas"],
        "offers": [
            {
                "industry": "Торговля и услуги",
                "scenario": "Внутрискладская логистика",
                "price": {"amount_rub": price},
                "source": SOURCE,
            }
        ],
    }


async def _own_product(client: AsyncClient, admin: dict[str, str], name: str = "Ронави Тест-1") -> dict:
    """A fresh card of the vendor's company, so moderation never touches the seeded catalog rows."""
    response = await client.post(f"{ADMIN}/catalog/products", json=_card(name), headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


async def test_overview_is_scoped_to_the_bound_company(client: AsyncClient) -> None:
    vendor = await _headers(client, "vendor@robomera.demo")
    response = await client.get(f"{VENDOR}/overview", headers=vendor)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["manufacturer"]["name"] == DEMO_VENDOR_MANUFACTURER
    assert body["products"], "у демо-производителя есть продукты в каталоге"
    assert {p["product"]["manufacturer"]["name"] for p in body["products"]} == {DEMO_VENDOR_MANUFACTURER}
    assert all(isinstance(p["missing_key_specs"], list) for p in body["products"])

    user = await _headers(client, "user@robomera.demo")
    assert (await client.get(f"{VENDOR}/overview", headers=user)).status_code == 403
    admin = await _headers(client, "admin@robomera.demo")
    unbound = await client.get(f"{VENDOR}/overview", headers=admin)
    assert unbound.status_code == 409
    assert "не привязана" in unbound.json()["detail"]


async def test_spec_proposal_goes_through_moderation(client: AsyncClient) -> None:
    admin = await _headers(client, "admin@robomera.demo")
    vendor = await _headers(client, "vendor@robomera.demo")
    product = await _own_product(client, admin)
    version = (await client.get("/api/v1/version")).json()["catalog_version"]

    proposal = {
        "product_id": product["id"],
        "specs": [{"key": "payload_kg", "value": 1500, "status": "confirmed", "source": SOURCE}],
        "comment": "Грузоподъёмность по паспорту 2026 года",
    }
    created = await client.post(f"{VENDOR}/proposals", json=proposal, headers=vendor)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "pending"
    assert body["kind"] == "update"
    assert body["specs"][0]["status"] == "vendor_claim", "вендор не может сам подтвердить свои ТТХ"
    assert (await client.get("/api/v1/version")).json()["catalog_version"] == version, (
        "до модерации каталог прежний"
    )

    again = await client.post(f"{VENDOR}/proposals", json=proposal, headers=vendor)
    assert again.status_code == 409

    queue = (await client.get(f"{ADMIN}/proposals", params={"status": "pending"}, headers=admin)).json()
    assert [item["id"] for item in queue["items"]] == [body["id"]]
    assert queue["items"][0]["author"]["email"] == "vendor@robomera.demo"

    review = await client.post(
        f"{ADMIN}/proposals/{body['id']}/review", json={"decision": "approve"}, headers=admin
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "approved"
    assert review.json()["reviewer_name"]

    detail = (await client.get(f"/api/v1/catalog/products/{product['id']}")).json()
    payload = next(s for s in detail["specs"] if s["key"] == "payload_kg")
    assert payload["value"] == 1500
    assert payload["provenance"]["status"] == "vendor_claim"
    assert (await client.get("/api/v1/version")).json()["catalog_version"] != version

    twice = await client.post(
        f"{ADMIN}/proposals/{body['id']}/review", json={"decision": "approve"}, headers=admin
    )
    assert twice.status_code == 409


async def test_card_proposal_keeps_company_and_admin_badges(client: AsyncClient) -> None:
    admin = await _headers(client, "admin@robomera.demo")
    vendor = await _headers(client, "vendor@robomera.demo")
    product = await _own_product(client, admin)
    assert "tested_fcbas" in product["badges"]

    card = _card("Ронави Тест-1 Pro", manufacturer="Чужая компания", price=2_900_000)
    card["badges"] = ["in_registry_719"]
    created = await client.post(
        f"{VENDOR}/proposals",
        json={"product_id": product["id"], "card": card, "comment": "Новая цена с 1 октября"},
        headers=vendor,
    )
    assert created.status_code == 201, created.text
    assert created.json()["card"]["manufacturer_name"] == DEMO_VENDOR_MANUFACTURER
    assert created.json()["card"]["badges"] == []

    await client.post(
        f"{ADMIN}/proposals/{created.json()['id']}/review",
        json={"decision": "approve", "comment": "Цена сверена с прайсом"},
        headers=admin,
    )
    detail = (await client.get(f"/api/v1/catalog/products/{product['id']}")).json()
    assert detail["name"] == "Ронави Тест-1 Pro"
    assert detail["manufacturer"]["name"] == DEMO_VENDOR_MANUFACTURER
    assert detail["price_from"]["amount_rub"] == 2_900_000
    assert "tested_fcbas" in detail["badges"], "отметку испытаний ставил админ — правка вендора её не снимает"
    assert "in_registry_719" not in detail["badges"]


async def test_rejection_needs_a_reason_and_reaches_the_vendor(client: AsyncClient) -> None:
    admin = await _headers(client, "admin@robomera.demo")
    vendor = await _headers(client, "vendor@robomera.demo")
    product = await _own_product(client, admin)
    created = await client.post(
        f"{VENDOR}/proposals",
        json={
            "product_id": product["id"],
            "specs": [{"key": "max_speed_mps", "value": 4.5, "source": SOURCE}],
            "comment": "Скорость после обновления прошивки",
        },
        headers=vendor,
    )
    url = f"{ADMIN}/proposals/{created.json()['id']}/review"
    assert (await client.post(url, json={"decision": "reject"}, headers=admin)).status_code == 422
    rejected = await client.post(
        url, json={"decision": "reject", "comment": "Нужен протокол испытаний"}, headers=admin
    )
    assert rejected.status_code == 200
    mine = (await client.get(f"{VENDOR}/proposals", headers=vendor)).json()["items"]
    assert mine[0]["status"] == "rejected"
    assert mine[0]["review_comment"] == "Нужен протокол испытаний"
    detail = (await client.get(f"/api/v1/catalog/products/{product['id']}")).json()
    assert all(s["key"] != "max_speed_mps" for s in detail["specs"])


async def test_new_product_is_created_on_approval(client: AsyncClient) -> None:
    admin = await _headers(client, "admin@robomera.demo")
    vendor = await _headers(client, "vendor@robomera.demo")
    created = await client.post(
        f"{VENDOR}/proposals",
        json={"card": _card("Ронави Новинка"), "comment": "Новая модель 2026 года"},
        headers=vendor,
    )
    assert created.status_code == 201, created.text
    assert created.json()["kind"] == "new_product"
    assert created.json()["product_id"] is None
    with_specs = await client.post(
        f"{VENDOR}/proposals",
        json={
            "card": _card("Ронави Новинка 2"),
            "specs": [{"key": "payload_kg", "value": 1000, "source": SOURCE}],
            "comment": "С характеристиками",
        },
        headers=vendor,
    )
    assert with_specs.status_code == 422

    approved = await client.post(
        f"{ADMIN}/proposals/{created.json()['id']}/review", json={"decision": "approve"}, headers=admin
    )
    product_id = approved.json()["product_id"]
    assert product_id
    detail = (await client.get(f"/api/v1/catalog/products/{product_id}")).json()
    assert detail["manufacturer"]["name"] == DEMO_VENDOR_MANUFACTURER
    overview = (await client.get(f"{VENDOR}/overview", headers=vendor)).json()
    assert product_id in {p["product"]["id"] for p in overview["products"]}


async def test_vendor_cannot_touch_foreign_products_and_can_withdraw(client: AsyncClient) -> None:
    admin = await _headers(client, "admin@robomera.demo")
    vendor = await _headers(client, "vendor@robomera.demo")
    foreign = await client.post(
        f"{ADMIN}/catalog/products", json=_card("Чужой AMR", "Чужая компания"), headers=admin
    )
    spec = {"key": "payload_kg", "value": 900, "source": SOURCE}
    denied = await client.post(
        f"{VENDOR}/proposals",
        json={"product_id": foreign.json()["id"], "specs": [spec], "comment": "Попытка"},
        headers=vendor,
    )
    assert denied.status_code == 404
    empty = await client.post(
        f"{VENDOR}/proposals", json={"product_id": foreign.json()["id"], "comment": "Пусто"}, headers=vendor
    )
    assert empty.status_code in {404, 422}

    product = await _own_product(client, admin)
    created = await client.post(
        f"{VENDOR}/proposals",
        json={"product_id": product["id"], "specs": [spec], "comment": "Уточнение"},
        headers=vendor,
    )
    url = f"{VENDOR}/proposals/{created.json()['id']}/withdraw"
    withdrawn = await client.post(url, headers=vendor)
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"
    assert (await client.post(url, headers=vendor)).status_code == 409
    review = await client.post(
        f"{ADMIN}/proposals/{created.json()['id']}/review", json={"decision": "approve"}, headers=admin
    )
    assert review.status_code == 409


async def test_admin_binds_vendor_to_a_manufacturer(client: AsyncClient) -> None:
    admin = await _headers(client, "admin@robomera.demo")
    manufacturers = (await client.get(f"{ADMIN}/manufacturers", headers=admin)).json()["items"]
    target = next(m for m in manufacturers if m["name"] != DEMO_VENDOR_MANUFACTURER)
    users = (await client.get(f"{ADMIN}/users", params={"role": "vendor"}, headers=admin)).json()["items"]
    vendor_id = next(u["id"] for u in users if u["email"] == "vendor@robomera.demo")
    updated = await client.patch(
        f"{ADMIN}/users/{vendor_id}", json={"vendor_manufacturer_id": target["id"]}, headers=admin
    )
    assert updated.status_code == 200, updated.text
    vendor = await _headers(client, "vendor@robomera.demo")
    overview = (await client.get(f"{VENDOR}/overview", headers=vendor)).json()
    assert overview["manufacturer"]["id"] == target["id"]
    user = await _headers(client, "user@robomera.demo")
    assert (await client.get(f"{ADMIN}/manufacturers", headers=user)).status_code == 403


async def test_fit_shows_how_products_pass_matching_without_project_data(client: AsyncClient) -> None:
    user = await _headers(client, "user@robomera.demo")
    payload = {
        "name": "Склад заказчика «Секрет»",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    assert (await client.post("/api/v1/projects", json=payload, headers=user)).status_code == 201

    vendor = await _headers(client, "vendor@robomera.demo")
    response = await client.get(f"{VENDOR}/fit", headers=vendor)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["projects_analysed"] == 1
    assert "Секрет" not in response.text, "вендор видит счётчики, а не чужие проекты"
    seen = [p for p in body["products"] if p["appearances"] > 0]
    assert seen, "продукты «Ронави» — кандидаты в подборе демо-склада"
    for item in seen:
        assert item["appearances"] == item["fit"] + item["check"] + item["excluded"] + item["manual"]
    assert any(p["missing"] or p["blocking"] for p in body["products"])


async def _rfq_scenario(client: AsyncClient) -> tuple[str, str, str, dict[str, str]]:
    user = await _headers(client, "user@robomera.demo")
    payload = {
        "name": "Склад «Секрет»",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project_id = (await client.post("/api/v1/projects", json=payload, headers=user)).json()["id"]
    matching = (await client.get(f"/api/v1/projects/{project_id}/matching", headers=user)).json()
    candidates = next(p for p in matching["processes"] if p["process_key"] == "pallet_transport")[
        "candidates"
    ]
    product_id = next(c for c in candidates if "H1500" in c["product"]["name"])["product"]["id"]
    scenario = {
        "name": "Покупка",
        "kind": "purchase",
        "items": [{"process_key": "pallet_transport", "product_id": product_id}],
    }
    created = await client.post(f"/api/v1/projects/{project_id}/scenarios", json=scenario, headers=user)
    assert created.status_code == 201, created.text
    return project_id, created.json()["id"], product_id, user


async def test_rfq_from_scenario_reaches_vendor_and_the_offer_comes_back(client: AsyncClient) -> None:
    project_id, scenario_id, product_id, user = await _rfq_scenario(client)
    url = f"/api/v1/projects/{project_id}/rfq"
    body = {
        "scenario_id": scenario_id,
        "items": [{"product_id": product_id, "quantity": 13}],
        "message": "Нужна поставка к марту",
        "share_contact": True,
    }
    sent = await client.post(url, json=body, headers=user)
    assert sent.status_code == 201, sent.text
    rfq = sent.json()["items"][0]
    assert rfq["status"] == "sent"
    assert rfq["object"]["object_type"] == "warehouse"
    assert rfq["object"]["params"], "производитель видит обязательные параметры объекта"

    vendor = await _headers(client, "vendor@robomera.demo")
    inbox = (await client.get(f"{VENDOR}/rfqs", headers=vendor)).json()["items"]
    assert [item["id"] for item in inbox] == [rfq["id"]]
    assert inbox[0]["contact"]["email"] == "user@robomera.demo"
    assert "Секрет" not in str(inbox), "название проекта производителю не показываем"

    reply = f"{VENDOR}/rfqs/{rfq['id']}/reply"
    assert (await client.post(reply, json={"decision": "offer"}, headers=vendor)).status_code == 422
    offer = {
        "decision": "offer",
        "price": {"amount_rub": 2_450_000},
        "lead_time_weeks": 8,
        "message": "Скидка 5 %",
    }
    answered = await client.post(reply, json=offer, headers=vendor)
    assert answered.status_code == 200, answered.text
    assert (await client.post(reply, json=offer, headers=vendor)).status_code == 409

    mine = (await client.get(url, headers=user)).json()["items"]
    assert mine[0]["status"] == "answered"
    assert mine[0]["price"]["amount_rub"] == 2_450_000
    assert mine[0]["contact"] is None

    admin = await _headers(client, "admin@robomera.demo")
    assert (await client.get(f"{ADMIN}/analytics/overview", headers=admin)).json()["rfq_count"] == 1


async def test_rfq_only_for_scenario_products_and_own_projects(client: AsyncClient) -> None:
    project_id, scenario_id, _, user = await _rfq_scenario(client)
    admin = await _headers(client, "admin@robomera.demo")
    foreign = await client.post(
        f"{ADMIN}/catalog/products", json=_card("Чужой AMR", "Чужая компания"), headers=admin
    )
    url = f"/api/v1/projects/{project_id}/rfq"
    body = {"scenario_id": scenario_id, "items": [{"product_id": foreign.json()["id"]}]}
    assert (await client.post(url, json=body, headers=user)).status_code == 422
    vendor = await _headers(client, "vendor@robomera.demo")
    assert (await client.get(url, headers=vendor)).status_code == 404
