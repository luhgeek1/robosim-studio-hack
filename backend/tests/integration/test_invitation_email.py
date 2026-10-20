import re
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.core.config import Settings
from app.db.models import EmailOutbox, OrganizationInvitation
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.infra.email import EmailDeliveryError
from app.service.mail.delivery import deliver_next
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration
ORGS = "/api/v1/organizations"
ACCEPT = "/api/v1/me/invitations"


async def _invite(client: AsyncClient, settings: Settings) -> tuple[str, dict, dict, str]:
    settings.resend_api_key = SecretStr("test-key")
    settings.email_from = "РобоМера <invite@mail.prooood.ru>"
    owner = bearer((await login(client, "user@robomera.demo"))["access"])
    recipient = bearer((await login(client, "vendor@robomera.demo"))["access"])
    org = (await client.post(ORGS, json={"name": '<Команда & "друзья">'}, headers=owner)).json()
    response = await client.post(
        f"{ORGS}/{org['id']}/invitations", json={"email": "vendor@robomera.demo"}, headers=owner
    )
    assert response.status_code == 201, response.text
    assert response.json()["email_delivery"] == "queued"
    invitation_id = response.json()["id"]
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            message = await uow.session.scalar(select(EmailOutbox))
            assert message is not None
            assert "&lt;Команда &amp; &quot;друзья&quot;&gt;" in message.payload["html"]
            token = re.search(r"#token=([A-Za-z0-9_-]+)", message.payload["text"])[1]
            row = await uow.session.get(OrganizationInvitation, UUID(invitation_id))
            assert row is not None
            assert row.token_hash != token
    finally:
        await db.dispose()
    return invitation_id, owner, recipient, token


async def test_invitation_requires_mail_proof_and_matching_account(
    client: AsyncClient, settings: Settings
) -> None:
    invitation_id, _, recipient, token = await _invite(client, settings)
    url = f"{ACCEPT}/{invitation_id}/accept"
    assert (await client.post(url, headers=recipient)).status_code == 403
    assert (await client.post(url, headers=recipient, json={"token": "wrong" * 8})).status_code == 403
    stranger = bearer((await login(client, "admin@robomera.demo"))["access"])
    assert (await client.post(url, headers=stranger, json={"token": token})).status_code == 404
    assert (await client.post(url, headers=recipient, json={"token": token})).status_code == 200
    assert (await client.post(url, headers=recipient, json={"token": token})).status_code == 404


async def test_outbox_retries_with_same_payload_and_key(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _invite(client, settings)
    send = AsyncMock(side_effect=[EmailDeliveryError("http_503", retryable=True), "resend-id"])
    monkeypatch.setattr("app.service.mail.delivery.send_email", send)
    db = Database(settings)
    try:
        assert await deliver_next(db, settings)
        async with UnitOfWork(db.session()) as uow:
            message = await uow.session.scalar(select(EmailOutbox))
            assert message.status == "queued"
            assert message.attempts == 1
            assert message.next_attempt_at > datetime.now(UTC)
            message.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
            await uow.commit()
        assert await deliver_next(db, settings)
        assert send.call_args_list[0].args[1:] == send.call_args_list[1].args[1:]
        async with UnitOfWork(db.session()) as uow:
            message = await uow.session.scalar(select(EmailOutbox))
            assert message.status == "sent"
            assert message.attempts == 2
            assert message.provider_id == "resend-id"
            assert message.payload == {}
        assert not await deliver_next(db, settings)
    finally:
        await db.dispose()


async def test_revoked_invitation_is_not_sent(
    client: AsyncClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    invitation_id, owner, _, _ = await _invite(client, settings)
    org_id = (await client.get(ORGS, headers=owner)).json()["items"][0]["id"]
    await client.delete(f"{ORGS}/{org_id}/invitations/{invitation_id}", headers=owner)
    send = AsyncMock()
    monkeypatch.setattr("app.service.mail.delivery.send_email", send)
    db = Database(settings)
    try:
        assert await deliver_next(db, settings)
        send.assert_not_awaited()
    finally:
        await db.dispose()


async def test_expired_invitation_cannot_be_accepted_and_can_be_replaced(
    client: AsyncClient, settings: Settings
) -> None:
    invitation_id, owner, recipient, token = await _invite(client, settings)
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            row = await uow.session.get(OrganizationInvitation, UUID(invitation_id))
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await uow.commit()
        assert (
            await client.post(f"{ACCEPT}/{invitation_id}/accept", headers=recipient, json={"token": token})
        ).status_code == 404
        assert (await client.get(ACCEPT, headers=recipient)).json()["items"] == []
        org_id = (await client.get(ORGS, headers=owner)).json()["items"][0]["id"]
        response = await client.post(
            f"{ORGS}/{org_id}/invitations", headers=owner, json={"email": "vendor@robomera.demo"}
        )
        assert response.status_code == 201
        assert response.json()["id"] != invitation_id
    finally:
        await db.dispose()
