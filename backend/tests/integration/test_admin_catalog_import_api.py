import csv
import io
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from app.seeds.catalog_sources import CATALOG_FILE
from tests.conftest import REPO_DIR, bearer, login

pytestmark = pytest.mark.integration

IMPORT = "/api/v1/admin/catalog/import"
PRODUCTS = "/api/v1/catalog/products"
H1500 = "5760e938-9a43-45a7-b8e8-f4f2e6383930"
NEW_CLEANER = "0f9c1a52-7d3e-4c8b-9e61-2a4b5c6d7e81"
NEW_AMR = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
SOURCE = {"kind": "vendor_site", "title": "Паспорт изделия", "url": "https://example.com/passport"}


@pytest.fixture(autouse=True)
async def reseed_catalog(settings: Settings) -> AsyncIterator[None]:
    """Imported cards live in seeded tables: drop new ones and let the next startup reload the bundled CSV."""
    yield
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM products WHERE id IN (:a, :b)"), {"a": NEW_CLEANER, "b": NEW_AMR}
        )
        admin_sources = "SELECT id FROM sources WHERE key LIKE 'admin:%'"
        await conn.execute(text(f"DELETE FROM product_specs WHERE source_id IN ({admin_sources})"))
        await conn.execute(text(f"DELETE FROM product_offers WHERE source_id IN ({admin_sources})"))
        await conn.execute(text("UPDATE products SET managed_by_seed = true, hidden_at = NULL"))
        await conn.execute(text("DELETE FROM sources WHERE key LIKE 'admin:%'"))
        await conn.execute(text("UPDATE data_versions SET content_hash = NULL WHERE key = 'catalog'"))
    await engine.dispose()


async def _admin(client: AsyncClient) -> dict[str, str]:
    return bearer((await login(client, "admin@robomera.demo"))["access"])


def _catalog(extra: list[dict[str, str]], price: str | None = None) -> bytes:
    """The bundled organizer file with H1500 repriced and extra rows appended, as an admin would upload it."""
    source = (REPO_DIR / CATALOG_FILE).read_text(encoding="utf-8-sig")
    reader = csv.DictReader(io.StringIO(source), delimiter=";")
    columns = list(reader.fieldnames or [])
    rows = [dict(row) for row in reader]
    if price is not None:
        for row in rows:
            if row["id"] == H1500:
                row["Цена изделия"] = price
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=columns, delimiter=";")
    writer.writeheader()
    writer.writerows(
        [*rows, *({column: extra_row.get(column, "") for column in columns} for extra_row in extra)]
    )
    return out.getvalue().encode("utf-8-sig")


def _row(product_id: str, name: str, subtype: str) -> dict[str, str]:
    return {
        "id": product_id,
        "Название": name,
        "тип": "brs",
        "статус": "operation",
        "компания": "ООО «Тестовая робототехника»",
        "описание": "Робот для проверки импорта каталога",
        "Тип": "Мобильные роботы",
        "Подтип": subtype,
        "Сценарий": "Уборка помещений",
        "Отрасль": "Торговля и услуги",
        "Цена изделия": "1 500 000,00",
    }


async def _upload(
    client: AsyncClient, headers: dict[str, str], content: bytes, *, dry_run: bool, name: str = "catalog.csv"
) -> dict:
    response = await client.post(
        IMPORT,
        params={"dry_run": dry_run},
        files={"file": (name, content, "text/csv")},
        data={"notes": "Выгрузка организатора"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_dry_run_previews_without_writing(client: AsyncClient) -> None:
    headers = await _admin(client)
    before = (await client.get("/api/v1/version")).json()["catalog_version"]
    old_price = (await client.get(f"{PRODUCTS}/{H1500}")).json()["price_from"]["amount_rub"]
    extra = [
        _row(NEW_CLEANER, "Тестовый уборщик Т-1", "Робот уборщик"),
        _row(NEW_AMR, "Тестовый AMR", "AMR"),
        {**_row("", "Без идентификатора", "AMR")},
        {**_row("not-a-uuid", "Кривой id", "AMR")},
    ]
    body = await _upload(client, headers, _catalog(extra, price="2 900 000,00"), dry_run=True)
    assert body["dry_run"] is True
    assert body["catalog_version"] == before
    assert (body["created"], body["updated"], body["conflicts"], body["skipped"]) == (1, 1, 0, 1)
    assert body["unchanged"] > 100
    assert body["not_in_file"] == 0
    updated = next(item for item in body["items"] if item["action"] == "updated")
    assert updated["product_id"] == H1500
    price = next(change for change in updated["changes"] if change["field"] == "price_from_rub")
    assert (price["before"], price["after"]) == (old_price, 2_900_000)
    created = next(item for item in body["items"] if item["action"] == "created")
    assert created["solution_type"] == "cleaning_robot"
    messages = " ".join(error["message"] for error in body["errors"])
    assert "not-a-uuid" in messages
    assert "Тестовый AMR" in messages
    card = (await client.get(f"{PRODUCTS}/{H1500}")).json()
    assert card["price_from"]["amount_rub"] == old_price
    assert (await client.get(f"{PRODUCTS}/{NEW_CLEANER}")).status_code == 404
    assert (await client.get("/api/v1/version")).json()["catalog_version"] == before


async def test_apply_updates_adds_and_bumps_version_once(client: AsyncClient) -> None:
    headers = await _admin(client)
    before = (await client.get("/api/v1/version")).json()["catalog_version"]
    content = _catalog([_row(NEW_CLEANER, "Тестовый уборщик Т-1", "Робот-уборщик")], price="2 900 000,00")
    body = await _upload(client, headers, content, dry_run=False)
    assert (body["created"], body["updated"]) == (1, 1)
    assert body["offers_created"] == 1
    assert body["catalog_version"] != before
    assert (await client.get("/api/v1/version")).json()["catalog_version"] == body["catalog_version"]
    card = (await client.get(f"{PRODUCTS}/{H1500}")).json()
    assert card["price_from"]["amount_rub"] == 2_900_000
    new = (await client.get(f"{PRODUCTS}/{NEW_CLEANER}")).json()
    assert new["solution_type"] == "cleaning_robot"
    assert new["manufacturer"]["name"] == "ООО «Тестовая робототехника»"
    assert new["offers"][0]["source"]["title"].startswith("catalog_export_v4.csv")
    again = await _upload(client, headers, content, dry_run=False)
    assert (again["created"], again["updated"], again["items"]) == (0, 0, [])
    assert again["catalog_version"] == body["catalog_version"]


async def test_admin_edited_and_hidden_cards_are_conflicts(client: AsyncClient) -> None:
    headers = await _admin(client)
    old_price = (await client.get(f"{PRODUCTS}/{H1500}")).json()["price_from"]["amount_rub"]
    found = (await client.get(PRODUCTS, params={"q": "уборщик", "page_size": 1})).json()["items"][0]
    specs = {"specs": [{"key": "payload_kg", "value": 1600, "source": SOURCE}]}
    edited = await client.put(f"/api/v1/admin/catalog/products/{H1500}/specs", json=specs, headers=headers)
    assert edited.status_code == 200, edited.text
    hidden = await client.delete(f"/api/v1/admin/catalog/products/{found['id']}", headers=headers)
    assert hidden.status_code == 204
    body = await _upload(client, headers, _catalog([], price="3 100 000,00"), dry_run=False)
    conflicts = {item["product_id"]: item["reason"] for item in body["items"] if item["action"] == "conflict"}
    assert set(conflicts) == {H1500, found["id"]}
    assert "изменён" in conflicts[H1500]
    assert "скрыт" in conflicts[found["id"]]
    assert body["updated"] == 0
    card = (await client.get(f"{PRODUCTS}/{H1500}")).json()
    assert card["price_from"]["amount_rub"] == old_price


async def test_import_rejects_wrong_files_and_users(client: AsyncClient) -> None:
    headers = await _admin(client)
    wrong_type = await client.post(
        IMPORT, files={"file": ("catalog.xlsx", b"PK", "application/zip")}, headers=headers
    )
    assert wrong_type.status_code == 415
    no_columns = await client.post(
        IMPORT, files={"file": ("c.csv", b"a;b\n1;2\n", "text/csv")}, headers=headers
    )
    assert no_columns.status_code == 422
    assert "Название" in no_columns.json()["detail"]
    user = bearer((await login(client, "user@robomera.demo"))["access"])
    forbidden = await client.post(IMPORT, files={"file": ("c.csv", b"id\n", "text/csv")}, headers=user)
    assert forbidden.status_code == 403
