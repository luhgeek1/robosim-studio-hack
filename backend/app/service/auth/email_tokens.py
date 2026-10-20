import secrets
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Literal
from uuid import UUID

from sqlalchemy import select, update

from app.core.config import Settings
from app.core.errors import ServiceUnavailableError, UnauthorizedError
from app.core.security.passwords import hash_password
from app.db.models import AuthEmailToken, AuthSession, EmailOutbox, User, UserCredential
from app.db.uow import UnitOfWork
from app.service.mail.invitations import token_hash

Purpose = Literal["verify_email", "reset_password"]


async def request_email(uow: UnitOfWork, settings: Settings, email: str, purpose: Purpose) -> None:
    if not settings.email_enabled:
        raise ServiceUnavailableError("Почтовый сервис не настроен. Обратитесь к администратору.")
    user = await uow.session.scalar(select(User).where(User.email == email.strip().lower()).with_for_update())
    if user is None or not user.is_active or user.guest_expires_at is not None:
        return
    if purpose == "verify_email" and user.email_verified_at is not None:
        return
    if purpose == "reset_password" and await uow.session.get(UserCredential, user.id) is None:
        return
    recent = await uow.session.scalar(
        select(AuthEmailToken.id)
        .where(
            AuthEmailToken.user_id == user.id,
            AuthEmailToken.purpose == purpose,
            AuthEmailToken.created_at > datetime.now(UTC) - timedelta(seconds=60),
        )
        .limit(1)
    )
    if recent:
        return
    await _issue(uow, settings, user, purpose)


async def _issue(uow: UnitOfWork, settings: Settings, user: User, purpose: Purpose) -> None:
    now = datetime.now(UTC)
    await uow.session.execute(
        update(AuthEmailToken)
        .where(
            AuthEmailToken.user_id == user.id,
            AuthEmailToken.purpose == purpose,
            AuthEmailToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    raw_token = secrets.token_urlsafe(32)
    ttl = (
        timedelta(hours=settings.verification_ttl_hours)
        if purpose == "verify_email"
        else timedelta(minutes=settings.password_reset_ttl_minutes)
    )
    token = AuthEmailToken(
        user_id=user.id,
        purpose=purpose,
        token_hash=token_hash(raw_token),
        expires_at=now + ttl,
        email=user.email,
        auth_version=user.auth_version,
    )
    uow.session.add(token)
    await uow.flush()
    route = "verify-email" if purpose == "verify_email" else "reset-password"
    link = f"{settings.public_web_url.rstrip('/')}/{route}#token={raw_token}"
    subject = "Подтвердите почту в РобоМере" if purpose == "verify_email" else "Смена пароля РобоМеры"
    instruction = "Подтвердить почту" if purpose == "verify_email" else "Задать новый пароль"
    text = f"{subject}\n\n{instruction}: {link}\n\nЕсли это не вы, проигнорируйте письмо."
    html = (
        f'<html lang="ru"><body><h1>{subject}</h1><p><a href="{escape(link, quote=True)}">'
        f"{instruction}</a></p><p>Если это не вы, проигнорируйте письмо.</p></body></html>"
    )
    uow.session.add(
        EmailOutbox(
            auth_email_token_id=token.id,
            payload={
                "from": settings.email_from,
                "to": [user.email],
                "subject": subject,
                "html": html,
                "text": text,
            },
        )
    )
    await uow.flush()


async def consume_email(
    uow: UnitOfWork, raw_token: str, purpose: Purpose, password: str | None = None
) -> UUID:
    digest = token_hash(raw_token)
    user_id = await uow.session.scalar(
        select(AuthEmailToken.user_id).where(AuthEmailToken.token_hash == digest)
    )
    user: User | None = (
        await uow.session.scalar(select(User).where(User.id == user_id).with_for_update())
        if user_id
        else None
    )
    token = await uow.session.scalar(
        select(AuthEmailToken).where(AuthEmailToken.token_hash == digest).with_for_update()
    )
    now = datetime.now(UTC)
    if (
        user is None
        or not user.is_active
        or token is None
        or token.purpose != purpose
        or token.auth_version != user.auth_version
        or token.email.lower() != user.email.lower()
        or (token.consumed_at is not None or token.expires_at <= now)
    ):
        raise UnauthorizedError("Ссылка недействительна или истекла. Запросите новое письмо.")
    if purpose == "reset_password":
        credential = await uow.session.get(UserCredential, user.id)
        if credential is None or password is None:
            raise UnauthorizedError("Восстановите доступ через свой сервис входа")
        credential.password_hash = await hash_password(password)
        await revoke_all_sessions(uow, user)
    user.email_verified_at = user.email_verified_at or now
    token.consumed_at = now
    await uow.flush()
    result: UUID = user.id
    return result


async def revoke_all_sessions(uow: UnitOfWork, user: User) -> None:
    user.auth_version += 1
    await uow.session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )

    await uow.session.execute(
        update(AuthEmailToken)
        .where(AuthEmailToken.user_id == user.id, AuthEmailToken.consumed_at.is_(None))
        .values(consumed_at=datetime.now(UTC))
    )
