from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import pytest
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.core.config import Settings
from app.db.models import AuthSession, OAuthIdentity, UserCredential
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.auth.security import RemoteIdentity
from tests.conftest import bearer

pytestmark = pytest.mark.integration
BASE = "/api/v1/auth/oauth"


def _configure(settings: Settings, monkeypatch: pytest.MonkeyPatch, email: str = "new@example.com") -> None:
    settings.google_client_id = "google-client"
    settings.google_client_secret = SecretStr("test-secret")
    settings.yandex_client_id = "yandex-client"
    settings.yandex_client_secret = SecretStr("test-secret")
    settings.vk_client_id = "vk-client"

    async def identity(*args, **kwargs):
        return RemoteIdentity(subject="stable-subject", email=email, name="Иван", email_verified=True)

    monkeypatch.setattr("app.service.auth.oauth_flows.exchange_identity", identity)


async def _start(client: AsyncClient, provider: str = "google", **kwargs) -> str:
    response = await client.post(
        f"{BASE}/{provider}/start", json={"return_to": "/account", **kwargs.pop("body", {})}, **kwargs
    )
    assert response.status_code == 200, response.text
    return parse_qs(urlsplit(response.json()["authorization_url"]).query)["state"][0]


async def _finish(client: AsyncClient, state: str, provider: str = "google"):
    return await client.get(
        f"{BASE}/{provider}/callback",
        params={"state": state, "code": "test-code", "device_id": "device"},
        follow_redirects=False,
    )


@pytest.mark.parametrize("provider", ["google", "yandex", "vk"])
async def test_social_signup_and_login_use_same_identity(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch, provider: str
) -> None:
    _configure(settings, monkeypatch)
    state = await _start(client, provider)
    completed = await _finish(client, state, provider)
    assert completed.status_code == 303
    assert completed.headers["location"] == settings.public_web_url + "/account"
    assert "refresh_token=" not in completed.headers["location"]
    refresh = await client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": client.cookies["csrf_token"]}
    )
    assert refresh.status_code == 200, refresh.text
    user_id = refresh.json()["user"]["id"]
    auth = bearer(refresh.json()["access_token"])
    snapshot = (await client.get("/api/v1/me/security", headers=auth)).json()
    assert snapshot["has_password"] is False
    assert snapshot["identities"][0]["provider"] == provider
    again = await _finish(client, await _start(client, provider), provider)
    assert again.status_code == 303
    next_session = await client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": client.cookies["csrf_token"]}
    )
    assert next_session.json()["user"]["id"] == user_id


async def test_callback_is_browser_bound_and_single_use(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(settings, monkeypatch)
    state = await _start(client)
    async with AsyncClient(transport=client._transport, base_url="http://test") as stranger:
        rejected = await _finish(stranger, state)
        assert "auth_error=" in rejected.headers["location"]
    assert "auth_error=" not in (await _finish(client, state)).headers["location"]
    assert "auth_error=" in (await _finish(client, state)).headers["location"]


async def test_email_collision_requires_explicit_link_and_last_method_is_protected(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(settings, monkeypatch, "user@robomera.demo")
    collision = await _finish(client, await _start(client))
    assert "auth_error=" in collision.headers["location"]
    signed = await client.post(
        "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
    )
    auth = bearer(signed.json()["access_token"])
    linked = await _finish(client, await _start(client, headers=auth, body={"intent": "link"}))
    assert linked.headers["location"] == settings.public_web_url + "/account"
    pair = (
        await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": client.cookies["csrf_token"]})
    ).json()
    auth = bearer(pair["access_token"])
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            credential = await uow.session.get(UserCredential, UUID(pair["user"]["id"]))
            await uow.session.delete(credential)
            await uow.commit()
        assert (await client.delete("/api/v1/me/identities/google", headers=auth)).status_code == 409
    finally:
        await db.dispose()


async def test_link_rejects_old_session_and_external_redirect(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(settings, monkeypatch)
    signed = await client.post(
        "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
    )
    auth = bearer(signed.json()["access_token"])
    snapshot = (await client.get("/api/v1/me/security", headers=auth)).json()
    session_id = UUID(snapshot["sessions"][0]["id"])
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            session = await uow.session.get(AuthSession, session_id)
            session.created_at = datetime.now(UTC) - timedelta(hours=1)
            await uow.commit()
        assert (
            await client.post(f"{BASE}/google/start", headers=auth, json={"intent": "link"})
        ).status_code == 403
        assert (
            await client.post(f"{BASE}/google/start", json={"return_to": "//evil.example"})
        ).status_code == 422
    finally:
        await db.dispose()


async def test_guest_projects_survive_social_signup(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(settings, monkeypatch)
    guest = (await client.post("/api/v1/auth/guest", headers={"X-Client": "web"})).json()
    old = bearer(guest["access_token"])
    project = (
        await client.post(
            "/api/v1/projects", headers=old, json={"name": "Мой объект", "object_type": "warehouse"}
        )
    ).json()
    state = await _start(
        client,
        body={"return_to": f"/projects/{project['id']}", "keep_guest_csrf": client.cookies["csrf_token"]},
    )
    response = await _finish(client, state)
    assert response.headers["location"] == settings.public_web_url + f"/projects/{project['id']}"
    pair = (
        await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": client.cookies["csrf_token"]})
    ).json()
    assert (
        await client.get(f"/api/v1/projects/{project['id']}", headers=bearer(pair["access_token"]))
    ).status_code == 200
    assert (await client.get("/api/v1/me", headers=old)).status_code == 401


async def test_revocation_during_provider_exchange_prevents_link(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(settings, monkeypatch)
    signed = (
        await client.post(
            "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
        )
    ).json()
    state = await _start(client, headers=bearer(signed["access_token"]), body={"intent": "link"})
    db = Database(settings)

    async def identity(*args, **kwargs):
        async with UnitOfWork(db.session()) as uow:
            user = await uow.users.get(UUID(signed["user"]["id"]))
            user.auth_version += 1
            await uow.commit()
        return RemoteIdentity(subject="subject", email="other@example.com", name="Иван", email_verified=True)

    monkeypatch.setattr("app.service.auth.oauth_flows.exchange_identity", identity)
    try:
        response = await _finish(client, state)
        assert "auth_error=" in response.headers["location"]
        async with UnitOfWork(db.session()) as uow:
            assert await uow.session.scalar(select(OAuthIdentity.id)) is None
    finally:
        await db.dispose()
