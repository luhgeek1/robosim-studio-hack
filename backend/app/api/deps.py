"""Request-scoped dependencies: settings, UoW (one transaction per request), user, permissions."""

from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated, Literal

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.errors import ForbiddenError, RateLimitedError, UnauthorizedError
from app.core.security.tokens import ClientKind, TokenCodec
from app.db.repositories.users import to_current_user
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser, Permission
from app.infra.rate_limit import RateLimiter
from app.infra.revocation import RevocationStore

_bearer = HTTPBearer(auto_error=False, description="Access-токен из /auth/login или /auth/refresh")


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_database(request: Request) -> Database:
    database: Database = request.app.state.db
    return database


def get_redis(request: Request) -> "Redis":
    redis: Redis = request.app.state.redis
    return redis


def get_codec(request: Request) -> TokenCodec:
    codec: TokenCodec = request.app.state.token_codec
    return codec


async def _uow(db: Annotated[Database, Depends(get_database)]) -> AsyncIterator[UnitOfWork]:
    async with UnitOfWork(db.session()) as uow:
        yield uow
        await uow.commit()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
RedisDep = Annotated["Redis", Depends(get_redis)]
CodecDep = Annotated[TokenCodec, Depends(get_codec)]
# scope="function": commit runs before the response is sent, so a failed commit is a 500, not a lost write.
UowDep = Annotated[UnitOfWork, Depends(_uow, scope="function")]


def get_revocations(redis: RedisDep) -> RevocationStore:
    return RevocationStore(redis)


RevocationsDep = Annotated[RevocationStore, Depends(get_revocations)]


def client_kind(
    x_client: Annotated[Literal["web", "mobile"], Header(alias="X-Client")] = "web",
) -> ClientKind:
    return x_client


ClientDep = Annotated[ClientKind, Depends(client_kind)]


async def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    codec: CodecDep,
    uow: UowDep,
) -> CurrentUser:
    if creds is None:
        raise UnauthorizedError()
    claims = codec.decode(creds.credentials, "access")
    user = await uow.users.get(claims.user_id)
    if user is None or user.auth_version != claims.auth_version:
        raise UnauthorizedError("Сессия недействительна, войдите снова")
    if not user.is_active:
        raise ForbiddenError("Учётная запись отключена администратором")
    return to_current_user(user)


CurrentUserDep = Annotated[CurrentUser, Depends(current_user)]


def require(permission: Permission) -> Callable[[CurrentUser], Awaitable[CurrentUser]]:
    async def dependency(user: CurrentUserDep) -> CurrentUser:
        if not user.can(permission):
            raise ForbiddenError()
        return user

    return dependency


def rate_limited(bucket: str) -> Callable[[Request, RedisDep, SettingsDep], Awaitable[None]]:
    """Per-client-IP limit for unauthenticated endpoints (login, register)."""

    async def dependency(request: Request, redis: RedisDep, settings: SettingsDep) -> None:
        limiter = RateLimiter(redis, limit=settings.auth_rate_limit_per_min, window_s=60)
        client_ip = request.client.host if request.client else "unknown"
        if not await limiter.hit(f"{bucket}:{client_ip}"):
            raise RateLimitedError()

    return dependency
