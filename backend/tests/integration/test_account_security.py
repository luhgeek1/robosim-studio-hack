import re
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.core.config import Settings
from app.db.models import AuthEmailToken, EmailOutbox
from app.db.session import Database
from app.db.uow import UnitOfWork
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


def _mail(settings: Settings) -> None:
    settings.resend_api_key = SecretStr("test-key")
    settings.email_from = "invite@mail.prooood.ru"


async def _email_token(settings: Settings, purpose: str) -> str:
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            message = await uow.session.scalar(
                select(EmailOutbox)
                .join(AuthEmailToken, AuthEmailToken.id == EmailOutbox.auth_email_token_id)
                .where(AuthEmailToken.purpose == purpose)
            )
            assert message is not None
            return re.search(r"#token=([A-Za-z0-9_-]+)", message.payload["text"])[1]
    finally:
        await db.dispose()


async def test_register_queues_verification_and_accepts_token_once(
    client: AsyncClient, settings: Settings
) -> None:
    _mail(settings)
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "name": "Иван", "password": "StrongPass123!"},
    )
    assert response.status_code == 201
    assert response.json()["user"]["email_verified"] is False
    token = await _email_token(settings, "verify_email")
    auth = bearer(response.json()["access_token"])
    assert (
        await client.post("/api/v1/organizations", headers=auth, json={"name": "Команда"})
    ).status_code == 403
    assert (await client.post("/api/v1/auth/email/verify", json={"token": token})).status_code == 204
    assert (await client.post("/api/v1/auth/email/verify", json={"token": token})).status_code == 401
    assert (await client.get("/api/v1/me", headers=auth)).json()["email_verified"] is True
    assert (
        await client.post("/api/v1/organizations", headers=auth, json={"name": "Команда"})
    ).status_code == 201


async def test_password_reset_hides_account_existence_and_revokes_every_session(
    client: AsyncClient, settings: Settings
) -> None:
    _mail(settings)
    tokens = await login(client, "user@robomera.demo")
    other = await login(client, "user@robomera.demo")
    known = await client.post("/api/v1/auth/password/forgot", json={"email": "user@robomera.demo"})
    unknown = await client.post("/api/v1/auth/password/forgot", json={"email": "absent@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    token = await _email_token(settings, "reset_password")
    assert (await client.post("/api/v1/auth/email/verify", json={"token": token})).status_code == 401
    reset = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "password": "ChangedPass123!"}
    )
    assert reset.status_code == 204
    assert (await client.get("/api/v1/me", headers=bearer(tokens["access"]))).status_code == 401
    assert (await client.get("/api/v1/me", headers=bearer(other["access"]))).status_code == 401
    assert (
        await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "OtherPass123!"})
    ).status_code == 401
    assert (
        await client.post(
            "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "Demo12345!"}
        )
    ).status_code == 401
    assert (
        await client.post(
            "/api/v1/auth/login", json={"email": "user@robomera.demo", "password": "ChangedPass123!"}
        )
    ).status_code == 200


async def test_expired_email_token_and_verification_cooldown(client: AsyncClient, settings: Settings) -> None:
    _mail(settings)
    await client.post("/api/v1/auth/password/forgot", json={"email": "user@robomera.demo"})
    token = await _email_token(settings, "reset_password")
    await client.post("/api/v1/auth/password/forgot", json={"email": "user@robomera.demo"})
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            rows = list(await uow.session.scalars(select(AuthEmailToken)))
            assert len(rows) == 1
            rows[0].expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await uow.commit()
    finally:
        await db.dispose()
    assert (
        await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "ChangedPass123!"})
    ).status_code == 401


async def test_session_list_and_revoke_are_isolated(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    second = await login(client, "user@robomera.demo")
    other = await login(client, "admin@robomera.demo")
    auth = bearer(tokens["access"])
    snapshot = (await client.get("/api/v1/me/security", headers=auth)).json()
    assert snapshot["has_password"] is True
    assert len(snapshot["sessions"]) == 2
    current = next(s for s in snapshot["sessions"] if s["current"])
    target = next(s for s in snapshot["sessions"] if not s["current"])
    assert (
        await client.delete(f"/api/v1/me/sessions/{current['id']}", headers=bearer(other["access"]))
    ).status_code == 404
    assert (await client.delete(f"/api/v1/me/sessions/{target['id']}", headers=auth)).status_code == 204
    assert (await client.get("/api/v1/me", headers=bearer(second["access"]))).status_code == 401
    assert (await client.get("/api/v1/me", headers=auth)).status_code == 200


async def test_password_change_checks_current_password(client: AsyncClient) -> None:
    tokens = await login(client, "user@robomera.demo")
    auth = bearer(tokens["access"])
    payload = {"password": "ChangedPass123!", "current_password": "wrong"}
    assert (await client.put("/api/v1/me/password", headers=auth, json=payload)).status_code == 403
    payload["current_password"] = "Demo12345!"
    assert (await client.put("/api/v1/me/password", headers=auth, json=payload)).status_code == 204
    assert (await client.get("/api/v1/me", headers=auth)).status_code == 401


async def test_changing_password_invalidates_earlier_reset_link(
    client: AsyncClient, settings: Settings
) -> None:
    _mail(settings)
    tokens = await login(client, "user@robomera.demo")
    await client.post("/api/v1/auth/password/forgot", json={"email": "user@robomera.demo"})
    token = await _email_token(settings, "reset_password")
    changed = await client.put(
        "/api/v1/me/password",
        headers=bearer(tokens["access"]),
        json={"current_password": "Demo12345!", "password": "ChangedPass123!"},
    )
    assert changed.status_code == 204
    assert (
        await client.post(
            "/api/v1/auth/password/reset", json={"token": token, "password": "AttackerPass123!"}
        )
    ).status_code == 401
