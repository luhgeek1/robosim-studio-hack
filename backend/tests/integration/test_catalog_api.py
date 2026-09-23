import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

PRODUCTS = "/api/v1/catalog/products"


async def _find(client: AsyncClient, name_part: str) -> dict:
    items = (await client.get(PRODUCTS, params={"q": name_part, "page_size": 5})).json()["items"]
    return next(item for item in items if name_part.lower() in item["name"].lower())


async def test_catalog_has_all_unique_products(client: AsyncClient) -> None:
    body = (await client.get(PRODUCTS, params={"page_size": 1})).json()
    assert body["total"] == 187


async def test_warehouse_pallet_transport_filter(client: AsyncClient) -> None:
    body = (
        await client.get(PRODUCTS, params={"object_type": "warehouse", "process_key": "pallet_transport"})
    ).json()
    assert body["total"] > 5
    assert all("warehouse" in item["object_types"] for item in body["items"])


async def test_array_filters_accept_comma_form(client: AsyncClient) -> None:
    body = (
        await client.get(PRODUCTS, params={"solution_type": "amr_transport,fmr_forklift", "page_size": 200})
    ).json()
    assert {item["solution_type"] for item in body["items"]} == {"amr_transport", "fmr_forklift"}


async def test_payload_and_price_filters(client: AsyncClient) -> None:
    body = (await client.get(PRODUCTS, params={"payload_min_kg": 1000, "price_max_rub": 3_000_000})).json()
    assert body["total"] >= 1
    assert all(item["price_from"]["amount_rub"] <= 3_000_000 for item in body["items"])


async def test_sort_by_price(client: AsyncClient) -> None:
    items = (await client.get(PRODUCTS, params={"sort": "price_asc", "object_type": "warehouse"})).json()[
        "items"
    ]
    prices = [item["price_from"]["amount_rub"] for item in items]
    assert prices == sorted(prices)


async def test_duplicates_become_offers(client: AsyncClient) -> None:
    body = (await client.get(PRODUCTS, params={"page_size": 200, "sort": "name"})).json()
    total_offers = sum(item["offers_count"] for item in body["items"])
    body2 = (await client.get(PRODUCTS, params={"page_size": 200, "page": 2, "sort": "name"})).json()
    total_offers += sum(item["offers_count"] for item in body2["items"])
    assert total_offers == 223


async def test_product_detail_has_sourced_specs(client: AsyncClient) -> None:
    h1500 = await _find(client, "H1500")
    detail = (await client.get(f"{PRODUCTS}/{h1500['id']}")).json()
    specs = {spec["key"]: spec for spec in detail["specs"]}
    assert specs["payload_kg"]["value"] == 1500
    assert specs["payload_kg"]["provenance"]["status"] == "confirmed"
    assert specs["payload_kg"]["provenance"]["source"]["url"].startswith("https://")
    assert specs["width_mm"]["value"] == 654
    assert detail["offers"][0]["price"]["amount_rub"] == 2_700_000
    assert detail["offers"][0]["source"]["kind"] == "organizer_catalog"
    assert any(case["count"] == 48 for case in detail["cases"])


async def test_unknown_product_404(client: AsyncClient) -> None:
    response = await client.get(f"{PRODUCTS}/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_compare_highlights_best(client: AsyncClient) -> None:
    h1500 = await _find(client, "H1500")
    h2000 = await _find(client, "H2000")
    body = (
        await client.post("/api/v1/catalog/compare", json={"product_ids": [h1500["id"], h2000["id"]]})
    ).json()
    payload = next(row for row in body["rows"] if row["spec_key"] == "payload_kg")
    assert payload["best_product_id"] == h2000["id"]
    assert len(body["products"]) == 2


async def test_compare_needs_two_to_five(client: AsyncClient) -> None:
    h1500 = await _find(client, "H1500")
    response = await client.post("/api/v1/catalog/compare", json={"product_ids": [h1500["id"], h1500["id"]]})
    assert response.status_code == 400


async def test_facets_for_warehouse(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/catalog/facets", params={"object_type": "warehouse"})).json()
    assert body["solution_types"][0]["count"] > 0
    assert body["price_range"]["min_rub"] > 0
    assert any(badge["key"] == "tested_fcbas" for badge in body["badges"])


async def test_spec_keys_dictionary(client: AsyncClient) -> None:
    items = (await client.get("/api/v1/catalog/spec-keys")).json()["items"]
    payload = next(item for item in items if item["key"] == "payload_kg")
    assert payload["is_key_constraint"] is True
    assert payload["group"] == "technical"


async def test_compare_shows_compatibility_with_a_project(client: AsyncClient) -> None:
    h1500 = await _find(client, "H1500")
    h2000 = await _find(client, "H2000")
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    payload = {
        "name": "Склад",
        "object_type": "warehouse",
        "init": {"mode": "demo", "demo_key": "warehouse_demo_01"},
    }
    project = (await client.post("/api/v1/projects", json=payload, headers=headers)).json()
    request = {
        "product_ids": [h1500["id"], h2000["id"]],
        "project_id": project["id"],
        "process_key": "pallet_transport",
    }
    guest = await client.post("/api/v1/catalog/compare", json=request)
    assert guest.status_code == 401
    body = (await client.post("/api/v1/catalog/compare", json=request, headers=headers)).json()
    assert set(body["compatibility"]) == {h1500["id"], h2000["id"]}
    assert body["compatibility"][h1500["id"]] in {"fit", "check", "excluded"}
