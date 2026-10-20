import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, ForbiddenError, SessionCompromisedError, UnauthorizedError
from app.core.security.passwords import hash_password, needs_rehash, verify_password
from app.core.security.tokens import ClientKind, IssuedTokens, TokenCodec
from app.db.models import User, UserCredential
from app.db.repositories.users import to_profile
from app.db.uow import UnitOfWork
from app.domain.auth import Role, UserProfile
from app.service.auth.guests import ensure_guest_active
from app.service.auth.session_store import jti_hash, live_session, new_session

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
    def __init__(self, uow: UnitOfWork, codec: TokenCodec) -> None:
        self._uow = uow
        self._codec = codec

    async def create_session(self, user: User, client: ClientKind, method: str) -> SessionResult:
        tokens = await new_session(self._uow, self._codec, user, client, method)
        return SessionResult(user=to_profile(user), tokens=tokens)

    async def register(self, data: Registration, client: ClientKind) -> SessionResult:
        email = data.email.strip().lower()
        if await self._uow.users.email_exists(email):
            raise ConflictError("Пользователь с таким email уже зарегистрирован")
        user = User(
            email=email,
            name=data.name.strip(),
            role=Role.USER,
            organization=data.organization,
            position=data.position,
            auth_version=1,
            is_active=True,
            last_login_at=datetime.now(UTC),
        )
        self._uow.users.add(user)
        try:
            await self._uow.flush()
            self._uow.session.add(
                UserCredential(user_id=user.id, password_hash=await hash_password(data.password))
            )
            await self._uow.flush()
        except IntegrityError as exc:
            raise ConflictError("Пользователь с таким email уже зарегистрирован") from exc
        return await self.create_session(user, client, "password")

    async def login(self, email: str, password: str, client: ClientKind) -> SessionResult:
        user = await self._uow.users.get_by_email(email.strip().lower())
        credential = await self._uow.session.get(UserCredential, user.id) if user else None
        if credential is None:
            # Keep unknown users and social-only accounts on the same expensive password path.
            await hash_password(password[:128])
            raise UnauthorizedError(_BAD_CREDENTIALS)
        if not await verify_password(password, credential.password_hash):
            raise UnauthorizedError(_BAD_CREDENTIALS)
        if user is None or not user.is_active:
            raise ForbiddenError("Учётная запись отключена администратором")
        if needs_rehash(credential.password_hash):
            credential.password_hash = await hash_password(password)
        self._uow.users.touch_login(user, datetime.now(UTC))
        await self._uow.flush()
        return await self.create_session(user, client, "password")

    async def refresh(self, refresh_token: str, *, csrf: str | None, from_cookie: bool) -> SessionResult:
        claims = self._codec.decode(refresh_token, "refresh")
        if from_cookie and not self._codec.csrf_matches(refresh_token, csrf):
            raise ForbiddenError("Нет или неверный CSRF-токен")
        user = await self._uow.users.get(claims.user_id)
        if user is None or not user.is_active or user.auth_version != claims.auth_version:
            raise UnauthorizedError("Сессия недействительна, войдите снова")
        ensure_guest_active(user)
        session = await live_session(self._uow, claims, lock=True)
        if not secrets.compare_digest(session.refresh_jti_hash, jti_hash(claims.jti)):
            session.revoked_at = datetime.now(UTC)
            raise SessionCompromisedError("Обнаружено повторное использование refresh-токена. Войдите снова.")
        tokens = self._codec.issue(
            user.id, user.role, user.auth_version, claims.client, session.id, session.expires_at
        )
        session.refresh_jti_hash = jti_hash(self._codec.decode(tokens.refresh, "refresh").jti)
        session.last_seen_at = datetime.now(UTC)
        await self._uow.flush()
        return SessionResult(user=to_profile(user), tokens=tokens)

    async def logout(self, refresh_token: str, *, csrf: str | None = None, from_cookie: bool = False) -> None:
        claims = self._codec.decode(refresh_token, "refresh")
        if from_cookie and not self._codec.csrf_matches(refresh_token, csrf):
            raise ForbiddenError("Нет или неверный CSRF-токен")
        session = await live_session(self._uow, claims, lock=True)
        session.revoked_at = datetime.now(UTC)
        await self._uow.flush()
