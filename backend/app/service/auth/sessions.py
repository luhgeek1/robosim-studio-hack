from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError
from app.core.security.passwords import hash_password, needs_rehash, verify_password
from app.core.security.tokens import ClientKind, IssuedTokens, TokenCodec
from app.db.models import User
from app.db.repositories.users import to_profile
from app.db.uow import UnitOfWork
from app.domain.auth import Role, UserProfile
from app.infra.revocation import RevocationStore

_BAD_CREDENTIALS = "Неверный email или пароль"


@dataclass(frozen=True, slots=True)
class Registration:
    email: str
    password: str
    name: str
    organization: str | None = None
    position: str | None = None


@dataclass(frozen=True, slots=True)
class SessionResult:
    user: UserProfile
    tokens: IssuedTokens


class AuthService:
    def __init__(self, uow: UnitOfWork, codec: TokenCodec, revocations: RevocationStore) -> None:
        self._uow = uow
        self._codec = codec
        self._revocations = revocations

    def _session(self, user: User, client: ClientKind) -> SessionResult:
        tokens = self._codec.issue(user.id, user.role, user.auth_version, client)
        return SessionResult(user=to_profile(user), tokens=tokens)

    async def register(self, data: Registration, client: ClientKind) -> SessionResult:
        email = data.email.strip().lower()
        if await self._uow.users.email_exists(email):
            raise ConflictError("Пользователь с таким email уже зарегистрирован")
        user = User(
            email=email,
            password_hash=await hash_password(data.password),
            name=data.name.strip(),
            role=Role.USER,
            organization=data.organization,
            position=data.position,
            auth_version=1,
            is_active=True,
            last_login_at=datetime.now(UTC),
        )
        self._uow.users.add(user)
        await self._uow.flush()
        return self._session(user, client)

    async def login(self, email: str, password: str, client: ClientKind) -> SessionResult:
        user = await self._uow.users.get_by_email(email.strip().lower())
        if user is None or not await verify_password(password, user.password_hash):
            raise UnauthorizedError(_BAD_CREDENTIALS)
        if not user.is_active:
            raise ForbiddenError("Учётная запись отключена администратором")
        if needs_rehash(user.password_hash):
            user.password_hash = await hash_password(password)
        self._uow.users.touch_login(user, datetime.now(UTC))
        await self._uow.flush()
        return self._session(user, client)

    async def refresh(self, refresh_token: str, *, csrf: str | None, from_cookie: bool) -> SessionResult:
        claims = self._codec.decode(refresh_token, "refresh")
        if from_cookie and not self._codec.csrf_matches(refresh_token, csrf):
            raise ForbiddenError("Нет или неверный CSRF-токен")
        if await self._revocations.is_revoked(claims.jti):
            raise UnauthorizedError("Токен уже использован")
        user = await self._uow.users.get(claims.user_id)
        if user is None or not user.is_active or user.auth_version != claims.auth_version:
            raise UnauthorizedError("Сессия недействительна, войдите снова")
        await self._revocations.revoke(claims.jti, claims.expires_at)
        return self._session(user, claims.client)

    async def logout(self, refresh_token: str) -> None:
        claims = self._codec.decode(refresh_token, "refresh")
        await self._revocations.revoke(claims.jti, claims.expires_at)
