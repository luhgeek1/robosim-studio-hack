from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select

from app.core.config import Settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security.passwords import hash_password, verify_password
from app.db.models import AuthSession, OAuthIdentity, User, UserCredential
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.auth.security import AccountSecurity, IdentityInfo, OAuthProvider, SessionInfo
from app.service.auth.session_store import revoke_all_sessions


async def security_snapshot(uow: UnitOfWork, user: CurrentUser) -> AccountSecurity:
    row = await uow.users.get(user.id)
    if row is None:
        raise UnauthorizedError()
    identities = await uow.session.scalars(
        select(OAuthIdentity).where(OAuthIdentity.user_id == user.id).limit(10)
    )
    sessions = await uow.session.scalars(
        select(AuthSession)
        .where(
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
        .order_by(AuthSession.last_seen_at.desc())
        .limit(50)
    )
    return AccountSecurity(
        has_password=await uow.session.get(UserCredential, user.id) is not None,
        email_verified=row.email_verified_at is not None,
        identities=[IdentityInfo(provider=i.provider, connected_at=i.created_at) for i in identities],
        sessions=[
            SessionInfo(
                id=s.id,
                method=s.method,
                client=s.client,
                created_at=s.created_at,
                last_seen_at=s.last_seen_at,
                expires_at=s.expires_at,
                current=s.id == user.session_id,
            )
            for s in sessions
        ],
    )


async def require_recent_auth(uow: UnitOfWork, user: CurrentUser, settings: Settings) -> None:
    session = await uow.session.get(AuthSession, user.session_id) if user.session_id else None
    if (
        session is None
        or session.user_id != user.id
        or session.revoked_at is not None
        or (session.created_at < datetime.now(UTC) - timedelta(minutes=settings.recent_auth_minutes))
    ):
        raise ForbiddenError(
            "Для изменения способов входа выйдите и войдите заново, затем повторите действие"
        )


async def revoke_session(uow: UnitOfWork, user: CurrentUser, session_id: UUID) -> None:
    session = await uow.session.scalar(
        select(AuthSession)
        .where(AuthSession.id == session_id, AuthSession.user_id == user.id)
        .with_for_update()
    )
    if session is None:
        raise NotFoundError("Сессия не найдена")
    session.revoked_at = datetime.now(UTC)
    await uow.flush()


async def set_password(
    uow: UnitOfWork, user: CurrentUser, settings: Settings, password: str, current_password: str | None
) -> None:
    row = await uow.session.scalar(select(User).where(User.id == user.id).with_for_update())
    credential = await uow.session.get(UserCredential, user.id)
    if row is None:
        raise UnauthorizedError()
    if credential:
        if not current_password or not await verify_password(current_password, credential.password_hash):
            raise ForbiddenError("Текущий пароль неверен")
        credential.password_hash = await hash_password(password)
    else:
        await require_recent_auth(uow, user, settings)
        if row.email_verified_at is None:
            raise ForbiddenError("Сначала подтвердите почту")
        uow.session.add(UserCredential(user_id=user.id, password_hash=await hash_password(password)))
    await revoke_all_sessions(uow, row)
    await uow.flush()


async def unlink_identity(
    uow: UnitOfWork, user: CurrentUser, settings: Settings, provider: OAuthProvider
) -> None:
    await require_recent_auth(uow, user, settings)
    row = await uow.session.scalar(select(User).where(User.id == user.id).with_for_update())
    identity = await uow.session.scalar(
        select(OAuthIdentity).where(OAuthIdentity.user_id == user.id, OAuthIdentity.provider == provider)
    )
    if row is None or identity is None:
        raise NotFoundError("Способ входа не подключён")
    count = await uow.session.scalar(
        select(func.count()).select_from(OAuthIdentity).where(OAuthIdentity.user_id == user.id)
    )
    if count == 1 and await uow.session.get(UserCredential, user.id) is None:
        raise ConflictError(
            "Нельзя отключить последний способ входа. Сначала добавьте пароль или другой сервис."
        )
    await uow.session.delete(identity)
    await revoke_all_sessions(uow, row)
    await uow.flush()
