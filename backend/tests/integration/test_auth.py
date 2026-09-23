import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import create_app
from tests.conftest import bearer, login, make_settings

pytestmark = pytest.mark.integration

NEW_USER = {"email": "Director@Example.com", "password": "S3cure-pass", "name": "Иван Петров"}


async def test_register_mobile_returns_both_tokens_and_normalizes_email(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/register", json=NEW_USER, headers={"X-Client": "mobile"})
    assert response.status_code == 201
    body = response.json()
    assert body["refresh_token"]
    assert body["user"]["email"] == "director@example.com"
    assert body["user"]["role"] == "user"
    assert body["expires_in"] > 0


async def test_register_duplicate_email_conflicts(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json=NEW_USER)
    response = await client.post("/api/v1/auth/register", json={**NEW_USER, "email": "director@example.com"})
    assert response.status_code == 409
    assert response.json()["error_code"] == "CONFLICT"


async def test_web_login_sets_cookies_and_hides_refresh(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
    )
    assert response.status_code == 200
    assert response.json()["refresh_token"] is None
    assert "refresh_token" in response.cookies
    assert "csrf_token" in response.cookies


async def test_wrong_password_is_401(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "wrong-password"}
    )
    assert response.status_code == 401


async def test_web_refresh_requires_csrf(client: AsyncClient) -> None:
    login_response = await client.post(
        "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
    )
    csrf = login_response.cookies["csrf_token"]  # the client jar keeps refresh_token for /api/v1/auth

    no_csrf = await client.post("/api/v1/auth/refresh")
    assert no_csrf.status_code == 403

    ok = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert ok.status_code == 200
    assert ok.json()["refresh_token"] is None


async def test_refresh_rotation_rejects_reuse(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    first = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh"]}, headers={"X-Client": "mobile"}
    )
    assert first.status_code == 200
    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh"]})
    assert reuse.status_code == 401


async def test_access_token_is_not_accepted_as_refresh(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["access"]})
    assert response.status_code == 401


async def test_logout_revokes_refresh(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    logout = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": tokens["refresh"]}, headers=bearer(tokens["access"])
    )
    assert logout.status_code == 204
    again = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh"]})
    assert again.status_code == 401


async def test_me_get_and_patch(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    patched = await client.patch(
        "/api/v1/me", json={"position": "Директор по логистике"}, headers=bearer(tokens["access"])
    )
    assert patched.status_code == 200
    assert patched.json()["position"] == "Директор по логистике"
    me = await client.get("/api/v1/me", headers=bearer(tokens["access"]))
    assert me.json()["position"] == "Директор по логистике"
    assert me.json()["name"] == "Операционный директор"


async def test_login_rate_limit(settings: Settings) -> None:
    app = create_app(make_settings(auth_rate_limit_per_min=2))
    async with app.router.lifespan_context(app):
        await app.state.redis.flushdb()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            payload = {"email": "user@robomera.demo", "password": "wrong-password"}
            codes = [(await http.post("/api/v1/auth/login", json=payload)).status_code for _ in range(3)]
    assert codes == [401, 401, 429]
