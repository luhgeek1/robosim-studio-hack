import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, ForbiddenError, InvalidInputError, UnauthorizedError
from app.db.models import AuthSession, User
from app.db.models.oauth import OAuthIdentity
from app.db.uow import UnitOfWork
from app.domain.auth import Role
from app.domain.auth.security import OAuthProvider, RemoteIdentity


@dataclass(frozen=True, slots=True)
class LinkProof:
    user_id: UUID
    auth_version: int
    session_id: UUID
    refresh_jti_hash: str
    authenticated_after: datetime


async def resolve_account(
    uow: UnitOfWork, provider: OAuthProvider, identity: RemoteIdentity, proof: LinkProof | None
) -> User:
    # Serialize a first login for this subject without a global authentication lock.
    await uow.session.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:subject))"),
        {"subject": f"oauth:{provider}:{identity.subject}"},
    )
    linked_user = await _link_user(uow, proof) if proof else None
    existing = await uow.session.scalar(
        select(OAuthIdentity).where(
            OAuthIdentity.provider == provider, OAuthIdentity.subject == identity.subject
        )
    )
    if existing:
        if linked_user and existing.user_id != linked_user.id:
            raise ConflictError("Этот аккаунт сервиса уже подключён к другой учётной записи")
        user = linked_user or await uow.session.scalar(
            select(User).where(User.id == existing.user_id).with_for_update()
        )
        if (
            user is None
            or await uow.session.scalar(select(OAuthIdentity.id).where(OAuthIdentity.id == existing.id))
            is None
        ):
            raise UnauthorizedError("Способ входа был отключён. Войдите другим способом.")
    else:
        user = linked_user or await _create_user(uow, identity)
        previous = await uow.session.scalar(
            select(OAuthIdentity.id).where(
                OAuthIdentity.user_id == user.id, OAuthIdentity.provider == provider
            )
        )
        if previous:
            raise ConflictError("Другой аккаунт этого сервиса уже подключён")
        uow.session.add(OAuthIdentity(provider=provider.value, subject=identity.subject, user_id=user.id))
    if not user.is_active:
        raise ForbiddenError("Учётная запись отключена администратором")
    user.last_login_at = datetime.now(UTC)
    await _flush(uow)
    return user


async def _link_user(uow: UnitOfWork, proof: LinkProof) -> User:
    user = await uow.session.scalar(
        select(User)
        .where(User.id == proof.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    session = await uow.session.scalar(
        select(AuthSession)
        .where(AuthSession.id == proof.session_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        user is None
        or not user.is_active
        or user.role == Role.GUEST
        or user.auth_version != proof.auth_version
        or (
            user.email_verified_at is None
            or session is None
            or session.user_id != user.id
            or session.revoked_at is not None
            or session.expires_at <= datetime.now(UTC)
            or session.created_at < proof.authenticated_after
            or not secrets.compare_digest(session.refresh_jti_hash, proof.refresh_jti_hash)
        )
    ):
        raise UnauthorizedError("Сессия изменилась. Войдите заново и повторите подключение сервиса.")
    return user


async def _create_user(uow: UnitOfWork, identity: RemoteIdentity) -> User:
    if not identity.email:
        raise InvalidInputError(
            "Сервис не передал email. Зарегистрируйтесь по почте, затем подключите сервис в аккаунте."
        )
    if await uow.users.email_exists(identity.email):
        raise ConflictError(
            "Аккаунт с такой почтой уже есть. Войдите привычным способом и подключите сервис в аккаунте."
        )
    user = User(
        email=identity.email,
        name=identity.name,
        role=Role.USER,
        is_active=True,
        auth_version=1,
        email_verified_at=datetime.now(UTC) if identity.email_verified else None,
    )
    uow.users.add(user)
    await _flush(uow)
    return user


async def _flush(uow: UnitOfWork) -> None:
    try:
        await uow.flush()
    except IntegrityError as exc:
        raise ConflictError(
            "Аккаунт уже создан или сервис подключён. Повторите вход привычным способом."
        ) from exc
