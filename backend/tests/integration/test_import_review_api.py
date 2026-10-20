import json

import pytest
from httpx import AsyncClient

from tests.conftest import REPO_DIR, bearer, login

pytestmark = pytest.mark.integration
PROJECTS = "/api/v1/projects"


async def setup_import(client: AsyncClient, payload: object) -> tuple[str, dict[str, str], dict]:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    project = await client.post(
        PROJECTS, json={"name": "Проверка файла", "object_type": "warehouse"}, headers=headers
    )
    path = f"{PROJECTS}/{project.json()['id']}"
    response = await client.post(
        f"{path}/import",
        files={"file": ("review.json", json.dumps(payload).encode(), "application/json")},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return path, headers, response.json()


def edit(row: dict, **changes: object) -> dict:
    return {
        "row_id": row["row_id"],
        "key": row["key"],
        "value": row["value"],
        "unit": row["unit"],
        "excluded": row["excluded"],
        **changes,
    }


async def test_suggestions_are_reviewed_before_atomic_apply(client: AsyncClient) -> None:
    path, headers, preview = await setup_import(
        client,
        [
            {"key": "area_m2", "value": "20 000 м²"},
            {"key": "floor_type", "value": "Промышленый бетон"},
            {"key": "has_wms", "value": "возможно"},
            {"key": "floors", "value": 2.5},
            {"key": "ceiling_height_m", "value": 10000, "unit": "мм"},
        ],
    )
    rows = {r["key"]: r for r in preview["rows"]}
    assert len(preview["rows"]) == 5
    assert rows["area_m2"]["suggestion"]["value"] == 20000
    assert rows["floor_type"]["suggestion"] is not None
    assert rows["has_wms"]["suggestion"] is None
    assert rows["floors"]["issues"][0]["severity"] == "error"
    assert rows["ceiling_height_m"]["value"] == 10
    assert rows["ceiling_height_m"]["raw_value"] == "10000"
    before = (await client.get(f"{path}/params", headers=headers)).json()
    assert next(p for p in before["params"] if p["key"] == "area_m2")["value"] is None
    apply_path = f"{path}/import/{preview['import_id']}/apply"
    rejected = await client.post(apply_path, headers=headers)
    assert rejected.status_code == 422
    edits = []
    for row in preview["rows"]:
        suggestion = row["suggestion"]
        changes = {k: suggestion[k] for k in ("key", "value", "unit")} if suggestion else {}
        if row["key"] == "has_wms":
            changes["value"] = "Нет"
        if row["key"] == "floors":
            changes["value"] = 2
        edits.append(edit(row, **changes))
    reviewed = await client.post(
        f"{path}/import/{preview['import_id']}/review", json={"edits": edits}, headers=headers
    )
    assert reviewed.status_code == 200, reviewed.text
    assert len(reviewed.json()["mapped"]) == 5
    assert not any(i["severity"] == "error" for r in reviewed.json()["rows"] for i in r["issues"])
    unchanged = (await client.get(f"{path}/params", headers=headers)).json()
    assert unchanged["project_version"] == before["project_version"]
    applied = await client.post(
        apply_path, json={"row_ids": [r["row_id"] for r in preview["rows"]]}, headers=headers
    )
    assert applied.status_code == 200, applied.text
    params = {p["key"]: p for p in applied.json()["params"]}
    assert params["area_m2"]["value"] == 20000
    assert params["has_wms"]["value"] is False
    assert params["area_m2"]["provenance"]["raw_value"] == "20 000 м²"
    assert (await client.post(apply_path, headers=headers)).status_code == 422


async def test_duplicates_mapping_and_explicit_empty_selection(client: AsyncClient) -> None:
    path, headers, preview = await setup_import(
        client,
        [
            {"key": "area_m2", "value": 20000},
            {"key": "area_m2", "value": 10000},
            {"name": "Неизвестное поле", "value": 15000},
        ],
    )
    assert all(any(i["code"] == "DUPLICATE" for i in r["issues"]) for r in preview["rows"][:2])
    target = f"{path}/import/{preview['import_id']}"
    assert (await client.post(f"{target}/apply", json={"row_ids": []}, headers=headers)).status_code == 422
    edits = [edit(preview["rows"][1], excluded=True), edit(preview["rows"][2], key="robotized_area_m2")]
    reviewed = await client.post(f"{target}/review", json={"edits": edits}, headers=headers)
    assert reviewed.status_code == 200, reviewed.text
    assert len(reviewed.json()["mapped"]) == 2
    assert (await client.post(f"{target}/apply", headers=headers)).status_code == 200
    assert (await client.post(f"{target}/review", json={"edits": []}, headers=headers)).status_code == 422


async def test_preview_checks_relations_and_apply_rechecks_current_values(client: AsyncClient) -> None:
    path, headers, preview = await setup_import(client, {"area_m2": 20000, "robotized_area_m2": 30000})
    assert any(i["code"].startswith("CHECK_") for i in preview["validation"]["issues"])
    target = f"{path}/import/{preview['import_id']}"
    assert (await client.post(f"{target}/apply", headers=headers)).status_code == 422
    row = next(r for r in preview["rows"] if r["key"] == "robotized_area_m2")
    await client.post(f"{target}/review", json={"edits": [edit(row, value=10000)]}, headers=headers)
    await client.patch(f"{path}/params/area_m2", json={"value": 5000}, headers=headers)
    assert (await client.post(f"{target}/apply", headers=headers)).status_code == 422
    applied = await client.post(f"{target}/apply", json={"overwrite_user_values": True}, headers=headers)
    assert applied.status_code == 200, applied.text


async def test_export_roundtrip_and_wrong_object_type(client: AsyncClient) -> None:
    path, headers, _ = await setup_import(client, {"area_m2": 20000})
    await client.patch(f"{path}/params/area_m2", json={"value": 22000}, headers=headers)
    exported = (await client.get(f"{path}/export.json", headers=headers)).json()

    async def upload(payload: object) -> object:
        return await client.post(
            f"{path}/import", files={"file": ("export.json", json.dumps(payload).encode())}, headers=headers
        )

    result = await upload(exported)
    assert result.status_code == 200, result.text
    assert next(r for r in result.json()["rows"] if r["key"] == "area_m2")["value"] == 22000
    exported["project"]["object_type"] = "hospital"
    assert (await upload(exported)).status_code == 422


async def test_review_rejects_unknown_rows_and_other_users(client: AsyncClient) -> None:
    path, headers, preview = await setup_import(client, {"area_m2": 20000})
    target = f"{path}/import/{preview['import_id']}"
    row = edit(preview["rows"][0], row_id="999")
    assert (await client.post(f"{target}/review", json={"edits": [row]}, headers=headers)).status_code == 422
    stranger = bearer((await login(client, "vendor@robomera.demo"))["access"])
    assert (await client.post(f"{target}/review", json={"edits": []}, headers=stranger)).status_code == 404
    assert (
        await client.post(f"{target}/apply", json={"row_ids": ["999"]}, headers=headers)
    ).status_code == 422


@pytest.mark.parametrize(
    ("filename", "kind", "has_errors"),
    [
        ("warehouse-clean.json", "warehouse", False),
        ("warehouse-repairs.json", "warehouse", True),
        ("warehouse-duplicates.json", "warehouse", True),
        ("hospital-clean.json", "hospital", False),
        ("hospital-repairs.json", "hospital", True),
        ("broken-json.json", "warehouse", False),
    ],
)
async def test_downloadable_examples_match_expected_validation(
    client: AsyncClient, filename: str, kind: str, has_errors: bool
) -> None:
    headers = bearer((await login(client, "user@robomera.demo"))["access"])
    created = await client.post(PROJECTS, json={"name": "Учебный файл", "object_type": kind}, headers=headers)
    content = (REPO_DIR / "frontend" / "public" / "import-examples" / filename).read_bytes()
    response = await client.post(
        f"{PROJECTS}/{created.json()['id']}/import",
        files={"file": (filename, content, "application/json")},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert any(i["severity"] == "error" for r in body["rows"] for i in r["issues"]) == has_errors
    if filename == "broken-json.json":
        assert any("Формат JSON восстановлен" in warning for warning in body["warnings"])
