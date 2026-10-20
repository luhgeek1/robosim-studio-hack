import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import Settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security.tokens import TokenCodec
from app.db.models import User
from app.db.repositories.users import to_current_user
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser, Role
from app.domain.auth.security import OAuthProvider
from app.infra.oauth import authorization_url, callback_url, exchange_identity, get_provider
from app.service.auth.account_security import require_recent_auth
from app.service.auth.email_tokens import request_email
from app.service.auth.guests import transfer_guest
from app.service.auth.oauth_accounts import LinkProof, resolve_account
from app.service.auth.oauth_state import OAuthStateStore, return_path
from app.service.auth.session_store import jti_hash, live_session
from app.service.auth.sessions import AuthService, SessionResult


@dataclass(frozen=True, slots=True)
class OAuthStart:
    provider: OAuthProvider
    return_to: str
    link: bool
    keep_guest_csrf: str | None


@dataclass(frozen=True, slots=True)
class OAuthCallback:
    provider: OAuthProvider
    state: str
    browser: str | None
    code: str
    device_id: str | None


@dataclass(frozen=True, slots=True)
class OAuthRedirect:
    state: str
    browser: str
    url: str


class OAuthFlows:
    def __init__(self, uow: UnitOfWork, codec: TokenCodec, redis: Redis, settings: Settings) -> None:
        self._uow = uow
        self._codec = codec
        self._states = OAuthStateStore(redis)
        self._settings = settings

    async def start(self, data: OAuthStart, user: CurrentUser | None, cookie: str | None) -> OAuthRedirect:
        provider = get_provider(self._settings, data.provider)
        link_user_id = None
        guest_id = None
        if data.link:
            if user is None or user.role == Role.GUEST:
                raise UnauthorizedError("Сначала войдите в свой аккаунт РобоМеры")
            row = await self._cookie_user(cookie)
            if row.id != user.id:
                raise UnauthorizedError("Учётная запись изменилась. Обновите страницу.")
            await require_recent_auth(self._uow, user, self._settings)
            if row.email_verified_at is None:
                raise ForbiddenError("Сначала подтвердите свою почту в настройках аккаунта")
            link_user_id = str(user.id)
        elif data.keep_guest_csrf:
            row = await self._cookie_user(cookie)
            if (
                row.role != Role.GUEST
                or not cookie
                or not self._codec.csrf_matches(cookie, data.keep_guest_csrf)
            ):
                raise ForbiddenError("Не удалось подтвердить сохранение гостевого проекта")
            guest_id = str(row.id)
        state, browser, verifier = await self._states.create(
            {
                "provider": data.provider.value,
                "return_to": return_path(data.return_to),
                "link_user_id": link_user_id,
                "auth_version": user.auth_version if link_user_id and user else None,
                "link_session_id": str(user.session_id) if link_user_id and user else None,
                "guest_id": guest_id,
                "guest_csrf": data.keep_guest_csrf,
            }
        )
        return OAuthRedirect(
            state=state,
            browser=browser,
            url=authorization_url(provider, callback_url(self._settings, data.provider), state, verifier),
        )

    async def finish(self, data: OAuthCallback, cookie: str | None) -> tuple[SessionResult, str]:
        state = await self._states.consume(data.state, data.browser)
        if state["provider"] != data.provider.value:
            raise UnauthorizedError("Сервис входа не совпадает. Начните вход заново.")
        link_id = UUID(state["link_user_id"]) if state.get("link_user_id") else None
        proof = None
        if link_id:
            row = await self._cookie_user(cookie)
            claims = self._codec.decode(cookie or "", "refresh")
            if (
                row.id != link_id
                or row.auth_version != state["auth_version"]
                or str(claims.session_id) != state["link_session_id"]
            ):
                raise UnauthorizedError("Сессия изменилась. Повторите подключение сервиса.")
            await require_recent_auth(
                self._uow,
                to_current_user(row, self._codec.decode(cookie or "", "refresh").session_id),
                self._settings,
            )
        provider = get_provider(self._settings, data.provider)
        identity = await exchange_identity(
            provider,
            callback_url(self._settings, data.provider),
            data.code,
            state["verifier"],
            data.state,
            data.device_id,
        )
        if link_id:
            claims = self._codec.decode(cookie or "", "refresh")
            proof = LinkProof(
                user_id=link_id,
                auth_version=state["auth_version"],
                session_id=claims.session_id,
                refresh_jti_hash=jti_hash(claims.jti),
                authenticated_after=datetime.now(UTC) - timedelta(minutes=self._settings.recent_auth_minutes),
            )
        user = await resolve_account(self._uow, data.provider, identity, proof)
        if state.get("guest_id"):
            guest = await self._cookie_user(cookie)
            if str(guest.id) != state["guest_id"] or not cookie:
                raise UnauthorizedError("Гостевая сессия изменилась. Начните вход заново.")
            await transfer_guest(self._uow, self._codec, cookie, state["guest_csrf"], user.id)
        result = await AuthService(self._uow, self._codec).create_session(user, "web", data.provider.value)
        if self._settings.email_enabled and user.email_verified_at is None:
            await request_email(self._uow, self._settings, user.email, "verify_email")
        return result, return_path(state["return_to"])

    async def _cookie_user(self, cookie: str | None) -> User:
        if not cookie:
            raise UnauthorizedError("Сессия входа потеряна. Войдите заново.")
        claims = self._codec.decode(cookie, "refresh")
        row = await self._uow.session.scalar(select(User).where(User.id == claims.user_id))
        session = await live_session(self._uow, claims)
        if (
            row is None
            or not row.is_active
            or row.auth_version != claims.auth_version
            or not secrets.compare_digest(session.refresh_jti_hash, jti_hash(claims.jti))
        ):
            raise UnauthorizedError("Сессия входа изменилась. Войдите заново.")
        return row
