import base64
import hashlib
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.core.config import Settings
from app.core.errors import NotFoundError, ServiceUnavailableError, UnauthorizedError
from app.domain.auth.security import OAuthProvider, RemoteIdentity


@dataclass(frozen=True, slots=True)
class ProviderConfig:
    id: OAuthProvider
    name: str
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    user_url: str
    scope: str


def providers(settings: Settings) -> list[ProviderConfig]:
    return [
        ProviderConfig(
            OAuthProvider.YANDEX,
            "Яндекс ID",
            settings.yandex_client_id or "",
            settings.yandex_client_secret.get_secret_value() if settings.yandex_client_secret else "",
            "https://oauth.yandex.ru/authorize",
            "https://oauth.yandex.ru/token",
            "https://login.yandex.ru/info",
            "login:info login:email",
        ),
        ProviderConfig(
            OAuthProvider.GOOGLE,
            "Google",
            settings.google_client_id or "",
            settings.google_client_secret.get_secret_value() if settings.google_client_secret else "",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "https://openidconnect.googleapis.com/v1/userinfo",
            "openid email profile",
        ),
        ProviderConfig(
            OAuthProvider.VK,
            "VK ID",
            settings.vk_client_id or "",
            "",
            "https://id.vk.ru/authorize",
            "https://id.vk.ru/oauth2/auth",
            "https://id.vk.ru/oauth2/user_info",
            "email",
        ),
    ]


def enabled(provider: ProviderConfig) -> bool:
    return bool(provider.client_id and (provider.client_secret or provider.id == OAuthProvider.VK))


def get_provider(settings: Settings, key: OAuthProvider) -> ProviderConfig:
    provider = next(p for p in providers(settings) if p.id == key)
    if not enabled(provider):
        raise NotFoundError("Этот способ входа ещё не подключён")
    return provider


def callback_url(settings: Settings, provider: OAuthProvider) -> str:
    return f"{settings.public_api_url.rstrip('/')}/api/v1/auth/oauth/{provider}/callback"


def authorization_url(config: ProviderConfig, redirect: str, state: str, verifier: str) -> str:
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    params = {
        "client_id": config.client_id,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": config.scope,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if config.id == OAuthProvider.VK:
        params["code_challenge_method"] = "s256"
    return f"{config.authorize_url}?{urlencode(params)}"


async def exchange_identity(
    config: ProviderConfig, redirect: str, code: str, verifier: str, state: str, device_id: str | None
) -> RemoteIdentity:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect,
        "client_id": config.client_id,
        "code_verifier": verifier,
    }
    if config.client_secret:
        data["client_secret"] = config.client_secret
    if config.id == OAuthProvider.VK:
        if not device_id:
            raise UnauthorizedError("VK ID не передал идентификатор устройства. Повторите вход.")
        data.update(device_id=device_id, state=state)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            if config.id == OAuthProvider.VK:
                params = {key: value for key, value in data.items() if key != "code"}
                response = await client.post(config.token_url, params=params, data={"code": code})
            else:
                response = await client.post(config.token_url, data=data)
            tokens = _response(response)
            if config.id == OAuthProvider.VK and tokens.get("state") != state:
                raise UnauthorizedError("VK ID вернул неверное состояние входа")
            token = tokens.get("access_token")
            if not isinstance(token, str) or not token:
                raise UnauthorizedError("Сервис не подтвердил вход. Повторите попытку.")
            info = await _user_info(client, config, token)
    except httpx.TransportError as exc:
        raise ServiceUnavailableError("Сервис входа временно недоступен. Повторите попытку.") from exc
    return _identity(config.id, info)


def _response(response: httpx.Response) -> dict[str, Any]:
    if response.status_code == 429 or response.status_code >= 500:
        raise ServiceUnavailableError("Сервис входа временно недоступен. Повторите попытку.")
    try:
        data = response.json()
    except ValueError as exc:
        raise UnauthorizedError("Сервис вернул некорректный ответ") from exc
    if response.is_error or not isinstance(data, dict) or data.get("error"):
        raise UnauthorizedError("Сервис не подтвердил вход. Повторите попытку.")
    return data


async def _user_info(client: httpx.AsyncClient, config: ProviderConfig, token: str) -> dict[str, Any]:
    if config.id == OAuthProvider.VK:
        response = await client.post(
            config.user_url, params={"client_id": config.client_id}, data={"access_token": token}
        )
        data = _response(response).get("user")
        if not isinstance(data, dict):
            raise UnauthorizedError("VK ID не передал данные пользователя")
        return data
    scheme = "OAuth" if config.id == OAuthProvider.YANDEX else "Bearer"
    return _response(await client.get(config.user_url, headers={"Authorization": f"{scheme} {token}"}))


def _identity(provider: OAuthProvider, info: dict[str, Any]) -> RemoteIdentity:
    subject = info.get(
        {OAuthProvider.GOOGLE: "sub", OAuthProvider.YANDEX: "id", OAuthProvider.VK: "user_id"}[provider]
    )
    if (
        not isinstance(subject, (str, int))
        or isinstance(subject, bool)
        or not str(subject)
        or len(str(subject)) > 255
    ):
        raise UnauthorizedError("Сервис не передал идентификатор пользователя")
    email = info.get("default_email" if provider == OAuthProvider.YANDEX else "email")
    if provider == OAuthProvider.GOOGLE and info.get("email_verified") is not True:
        raise UnauthorizedError("Подтвердите email в Google, затем повторите вход")
    try:
        address = str(TypeAdapter(EmailStr).validate_python(email)).lower() if email else None
    except ValidationError as exc:
        raise UnauthorizedError("Сервис не передал корректный email") from exc
    name = (
        info.get("real_name")
        or info.get("name")
        or " ".join(str(info.get(key) or "") for key in ("first_name", "last_name")).strip()
        or "Пользователь"
    )
    return RemoteIdentity(
        subject=str(subject),
        email=address,
        name=str(name).strip()[:120] or "Пользователь",
        email_verified=provider == OAuthProvider.GOOGLE,
    )
