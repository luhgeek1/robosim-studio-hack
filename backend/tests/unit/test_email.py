from unittest.mock import AsyncMock, patch

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.infra.email import EmailDeliveryError, send_email


def test_email_configuration_requires_both_sender_and_key() -> None:
    with pytest.raises(ValidationError, match="must be set together"):
        Settings(resend_api_key="example")
    assert not Settings().email_enabled


async def test_send_email_uses_idempotency_and_does_not_expose_credentials() -> None:
    settings = Settings(resend_api_key="example", email_from="РобоМера <invite@example.com>")
    response = httpx.Response(200, json={"id": "email-123"})
    with patch("app.infra.email.httpx.AsyncClient.post", AsyncMock(return_value=response)) as post:
        assert await send_email(settings, {"subject": "Приглашение"}, "invitation/123") == "email-123"
    assert post.call_args.kwargs["headers"]["Idempotency-Key"] == "invitation/123"


@pytest.mark.parametrize(("status", "retryable"), [(429, True), (503, True), (403, False), (422, False)])
async def test_delivery_errors_are_sanitized(status: int, retryable: bool) -> None:
    settings = Settings(resend_api_key="example", email_from="invite@example.com")
    response = httpx.Response(status, text="sensitive provider response")
    with (
        patch("app.infra.email.httpx.AsyncClient.post", AsyncMock(return_value=response)),
        pytest.raises(EmailDeliveryError) as error,
    ):
        await send_email(settings, {}, "invitation/123")
    assert error.value.code == f"http_{status}"
    assert error.value.retryable is retryable
    assert "sensitive" not in str(error.value)
