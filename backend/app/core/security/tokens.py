"""JWT encoding and decoding. Access and refresh tokens carry different ``jti``; revocation lives in Redis."""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

import jwt

from app.core.config import Settings
from app.core.errors import TokenExpiredError, UnauthorizedError
from app.domain.auth import Role

TokenType = Literal["access", "refresh"]
ClientKind = Literal["web", "mobile"]


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: UUID
    jti: str
    typ: TokenType
    auth_version: int
    client: ClientKind
    role: Role
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class IssuedTokens:
    access: str
    refresh: str
    csrf: str
    access_ttl_s: int


class TokenCodec:
    def __init__(self, settings: Settings) -> None:
        self._secret = settings.jwt_secret.get_secret_value()
        self._csrf_key = settings.csrf_key.get_secret_value().encode()
        self._algorithm = settings.jwt_algorithm
        self._ttl: dict[TokenType, int] = {"access": settings.access_ttl_s, "refresh": settings.refresh_ttl_s}

    def _encode(
        self, typ: TokenType, user_id: UUID, role: Role, auth_version: int, client: ClientKind
    ) -> str:
        now = datetime.now(UTC)
        payload = {
            "sub": str(user_id),
            "jti": uuid4().hex,
            "typ": typ,
            "av": auth_version,
            "src": client,
            "role": role.value,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(seconds=self._ttl[typ])).timestamp()),
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def issue(self, user_id: UUID, role: Role, auth_version: int, client: ClientKind) -> IssuedTokens:
        refresh = self._encode("refresh", user_id, role, auth_version, client)
        return IssuedTokens(
            access=self._encode("access", user_id, role, auth_version, client),
            refresh=refresh,
            csrf=self.csrf_for(refresh),
            access_ttl_s=self._ttl["access"],
        )

    def csrf_for(self, refresh_token: str) -> str:
        return hmac.new(self._csrf_key, refresh_token.encode(), hashlib.sha256).hexdigest()

    def csrf_matches(self, refresh_token: str, csrf: str | None) -> bool:
        return csrf is not None and hmac.compare_digest(self.csrf_for(refresh_token), csrf)

    def decode(self, token: str, expected: TokenType) -> TokenClaims:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpiredError from exc
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Недействительный токен") from exc
        if payload.get("typ") != expected:
            raise UnauthorizedError("Неверный тип токена")
        try:
            return TokenClaims(
                user_id=UUID(payload["sub"]),
                jti=str(payload["jti"]),
                typ=expected,
                auth_version=int(payload["av"]),
                client="web" if payload.get("src") == "web" else "mobile",
                role=Role(payload["role"]),
                expires_at=datetime.fromtimestamp(int(payload["exp"]), UTC),
            )
        except (KeyError, ValueError) as exc:
            raise UnauthorizedError("Недействительный токен") from exc
