from typing import Any

import httpx

from app.core.config import Settings


class EmailDeliveryError(Exception):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


async def send_email(settings: Settings, payload: dict[str, Any], key: str) -> str:
    if settings.resend_api_key is None:
        raise EmailDeliveryError("not_configured", retryable=False)
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key.get_secret_value()}",
        "Idempotency-Key": key,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post("https://api.resend.com/emails", json=payload, headers=headers)
    except httpx.TransportError as exc:
        raise EmailDeliveryError("transport_error", retryable=True) from exc
    if response.is_error:
        raise EmailDeliveryError(
            f"http_{response.status_code}",
            retryable=response.status_code == 429 or response.status_code >= 500,
        )
    try:
        provider_id = response.json()["id"]
        if not isinstance(provider_id, str) or not provider_id:
            raise ValueError("Missing email id")
    except (ValueError, KeyError, TypeError) as exc:
        raise EmailDeliveryError("invalid_response", retryable=True) from exc
    return provider_id
