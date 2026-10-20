import hashlib
import json
import secrets
from typing import Any
from urllib.parse import urlsplit

from redis.asyncio import Redis

from app.core.errors import InvalidInputError, UnauthorizedError

OAUTH_TTL_S = 600
COOKIE_PATH = "/api/v1/auth/oauth"


def return_path(value: str) -> str:
    parsed = urlsplit(value)
    if (
        not value.startswith("/")
        or value.startswith("//")
        or parsed.scheme
        or parsed.netloc
        or ("\\" in value or any(ord(c) < 32 or ord(c) == 127 for c in value))
    ):
        raise InvalidInputError("Возврат после входа возможен только на страницу приложения")
    if parsed.path.startswith(("/api/", "/login")):
        raise InvalidInputError("Недопустимая страница возврата после входа")
    return value


class OAuthStateStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def create(self, data: dict[str, Any]) -> tuple[str, str, str]:
        state = secrets.token_urlsafe(32)
        browser = secrets.token_urlsafe(32)
        payload = {
            **data,
            "browser": hashlib.sha256(browser.encode()).hexdigest(),
            "verifier": secrets.token_urlsafe(48),
        }
        await self._redis.set(f"oauth:{state}", json.dumps(payload), ex=OAUTH_TTL_S)
        return state, browser, payload["verifier"]

    async def read(self, state: str, browser: str | None) -> dict[str, Any]:
        if not browser or len(state) > 128:
            raise UnauthorizedError("Сессия входа истекла. Начните вход заново.")
        raw = await self._redis.get(f"oauth:{state}")
        if raw is None:
            raise UnauthorizedError("Сессия входа истекла. Начните вход заново.")
        data: dict[str, Any] = json.loads(raw)
        if not secrets.compare_digest(data["browser"], hashlib.sha256(browser.encode()).hexdigest()):
            raise UnauthorizedError("Вход начат в другом браузере. Начните вход заново.")
        return data

    async def consume(self, state: str, browser: str | None) -> dict[str, Any]:
        data = await self.read(state, browser)
        # GETDEL makes the callback single-use even when two requests arrive together.
        if await self._redis.getdel(f"oauth:{state}") is None:
            raise UnauthorizedError("Сессия входа уже использована")
        return data
