import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


async def test_object_types_list_three_with_processes(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/object-types")).json()
    keys = [item["key"] for item in body["items"]]
    assert keys == ["warehouse", "airport", "hospital"]
    warehouse = body["items"][0]
    assert warehouse["depth"] == "full"
    assert {p["key"] for p in warehouse["processes"]} >= {"pallet_transport", "order_picking"}


async def test_dataset_defaults_carry_their_source(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/object-types/warehouse")).json()
    params = {p["key"]: p for g in body["parameter_groups"] for p in g["parameters"]}
    area = params["area_m2"]
    assert area["default"]["value"] == 20000
    assert area["default"]["provenance"]["status"] == "default"
    assert area["default"]["provenance"]["source"]["kind"] == "organizer_dataset"
    assumptions = [
        p for p in params.values() if p["default"] and p["default"]["provenance"]["status"] == "assumption"
    ]
    assert assumptions
    assert all(p["default"]["provenance"]["note"] for p in assumptions)


async def test_hospital_text_cells_keep_their_text(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/object-types/hospital")).json()
    params = {p["key"]: p for g in body["parameter_groups"] for p in g["parameters"]}
    assert params["mis_system"]["default"]["value"] == "Да (ЕМИАС)"


async def test_unknown_object_type_is_422(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/object-types/spaceport")).status_code == 422


async def test_solution_types_filtered_by_process(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/solution-types", params={"process_key": "pallet_transport"})).json()
    keys = {item["key"] for item in body["items"]}
    assert "amr_transport" in keys
    assert "cleaning_robot" not in keys


async def test_norms_each_have_source_and_rationale(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/norms")).json()
    assert body["version"] == "v1"
    assert len(body["items"]) >= 60
    assert all(item["source"]["title"] for item in body["items"])
    vat = next(item for item in body["items"] if item["key"] == "vat_rate")
    assert vat["value"] == 0.22


async def test_norm_sets_and_version(client: AsyncClient) -> None:
    sets = (await client.get("/api/v1/norm-sets")).json()["items"]
    assert sets[0]["is_current"] is True
    version = (await client.get("/api/v1/version")).json()
    assert version["norm_set_version"] == "v1"
    assert version["catalog_version"] != "none"


async def test_industries_have_counts(client: AsyncClient) -> None:
    items = (await client.get("/api/v1/industries")).json()["items"]
    trade = next(item for item in items if item["key"] == "trade")
    assert trade["products_count"] > 0
