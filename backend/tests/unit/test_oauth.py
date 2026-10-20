from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import InvalidInputError, UnauthorizedError
from app.domain.auth.security import OAuthProvider
from app.infra.oauth import authorization_url, exchange_identity, get_provider
from app.service.auth.oauth_state import return_path


def _settings() -> Settings:
    return Settings(
        yandex_client_id="yandex-client",
        yandex_client_secret="test-secret",
        google_client_id="google-client",
        google_client_secret="test-secret",
        vk_client_id="vk-client",
    )


@pytest.mark.parametrize(
    "path",
    ["https://evil.example", "//evil.example", "/\\evil", "/projects\n", "/api/v1/auth/login", "/login"],
)
def test_return_path_rejects_external_or_auth_redirects(path: str) -> None:
    with pytest.raises(InvalidInputError):
        return_path(path)


@pytest.mark.parametrize("provider", list(OAuthProvider))
async def test_oauth_uses_code_pkce_and_server_side_profile(provider: OAuthProvider) -> None:
    config = get_provider(_settings(), provider)
    query = parse_qs(
        urlsplit(authorization_url(config, "http://localhost:5173/callback", "state", "verifier")).query
    )
    assert query["response_type"] == ["code"]
    assert query["state"] == ["state"]
    assert query["code_challenge"] != ["verifier"]
    assert "client_secret" not in query
    info = {
        OAuthProvider.YANDEX: {"id": "subject-1", "default_email": "Person@example.com", "real_name": "Иван"},
        OAuthProvider.GOOGLE: {
            "sub": "subject-1",
            "email": "Person@example.com",
            "email_verified": True,
            "name": "Иван",
        },
        OAuthProvider.VK: {
            "user": {"user_id": "subject-1", "email": "Person@example.com", "first_name": "Иван"}
        },
    }[provider]
    tokens = httpx.Response(200, json={"access_token": "provider-token", "state": "state"})
    profile = httpx.Response(200, json=info)
    post = AsyncMock(side_effect=[tokens, profile] if provider == OAuthProvider.VK else [tokens])
    with (
        patch("app.infra.oauth.httpx.AsyncClient.post", post),
        patch("app.infra.oauth.httpx.AsyncClient.get", AsyncMock(return_value=profile)),
    ):
        identity = await exchange_identity(
            config, "http://localhost:5173/callback", "code", "verifier", "state", "device"
        )
    assert identity.subject == "subject-1"
    assert identity.email == "person@example.com"
    assert identity.email_verified is (provider == OAuthProvider.GOOGLE)


async def test_google_unverified_email_is_rejected() -> None:
    config = get_provider(_settings(), OAuthProvider.GOOGLE)
    with (
        patch(
            "app.infra.oauth.httpx.AsyncClient.post",
            AsyncMock(return_value=httpx.Response(200, json={"access_token": "token"})),
        ),
        patch(
            "app.infra.oauth.httpx.AsyncClient.get",
            AsyncMock(
                return_value=httpx.Response(
                    200, json={"sub": "id", "email": "person@example.com", "email_verified": False}
                )
            ),
        ),
        pytest.raises(UnauthorizedError, match="Подтвердите email"),
    ):
        await exchange_identity(config, "http://localhost:5173/callback", "code", "verifier", "state", None)
