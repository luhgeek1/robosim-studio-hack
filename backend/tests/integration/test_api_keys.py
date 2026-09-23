import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


async def test_create_list_revoke(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    headers = bearer(tokens["access"])

    created = await client.post(
        "/api/v1/me/api-keys", json={"name": "1С:WMS", "scopes": ["projects:write"]}, headers=headers
    )
    assert created.status_code == 201
    body = created.json()
    assert body["secret"].startswith(body["prefix"])

    listed = (await client.get("/api/v1/me/api-keys", headers=headers)).json()["items"]
    assert [key["id"] for key in listed] == [body["id"]]
    assert "secret" not in listed[0]

    assert (await client.delete(f"/api/v1/me/api-keys/{body['id']}", headers=headers)).status_code == 204
    assert (await client.get("/api/v1/me/api-keys", headers=headers)).json()["items"] == []
    assert (await client.delete(f"/api/v1/me/api-keys/{body['id']}", headers=headers)).status_code == 404


async def test_user_cannot_grant_admin_scope(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    response = await client.post(
        "/api/v1/me/api-keys",
        json={"name": "x", "scopes": ["catalog:write"]},
        headers=bearer(tokens["access"]),
    )
    assert response.status_code == 403


async def test_admin_can_grant_catalog_scope(client: AsyncClient) -> None:
    tokens = await login(client, "admin@robomera.demo")
    response = await client.post(
        "/api/v1/me/api-keys",
        json={"name": "sync", "scopes": ["catalog:write"]},
        headers=bearer(tokens["access"]),
    )
    assert response.status_code == 201
