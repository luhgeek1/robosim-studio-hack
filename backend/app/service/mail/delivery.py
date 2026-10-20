import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.db.models import AuthEmailToken, EmailOutbox, OrganizationInvitation
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.organization import InvitationStatus
from app.infra.email import EmailDeliveryError, send_email

logger = logging.getLogger(__name__)


async def deliver_next(db: Database, settings: Settings) -> bool:
    async with UnitOfWork(db.session()) as uow:
        message = await uow.session.scalar(
            select(EmailOutbox)
            .where(EmailOutbox.status == "queued", EmailOutbox.next_attempt_at <= datetime.now(UTC))
            .order_by(EmailOutbox.next_attempt_at, EmailOutbox.id)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if message is None:
            return False
        now = datetime.now(UTC)
        if not await _deliverable(uow, message, now):
            message.status = "cancelled"
            message.payload = {}
        elif message.created_at < now - timedelta(hours=23):
            # Resend only deduplicates for 24 h; never risk sending a second copy after that window.
            message.status = "failed"
            message.last_error = "retry_window_expired"
            message.payload = {}
        else:
            await _send(message, settings, now)
        await uow.commit()
        return True


async def _deliverable(uow: UnitOfWork, message: EmailOutbox, now: datetime) -> bool:
    if message.auth_email_token_id:
        token = await uow.session.get(AuthEmailToken, message.auth_email_token_id)
        return token is not None and token.consumed_at is None and token.expires_at > now
    if message.invitation_id:
        invitation = await uow.session.get(OrganizationInvitation, message.invitation_id)
        return (
            invitation is not None
            and invitation.status == InvitationStatus.PENDING
            and (invitation.expires_at is None or invitation.expires_at > now)
        )
    return False


async def _send(message: EmailOutbox, settings: Settings, now: datetime) -> None:
    message.attempts += 1
    try:
        message.provider_id = await send_email(settings, message.payload, f"email/{message.id}")
    except EmailDeliveryError as exc:
        message.last_error = exc.code
        if not exc.retryable or message.attempts >= settings.email_max_attempts:
            message.status = "failed"
            message.payload = {}
        else:
            message.next_attempt_at = now + timedelta(seconds=30 * 2 ** (message.attempts - 1))
        logger.warning("email_delivery_failed", extra={"outbox_id": str(message.id), "code": exc.code})
    else:
        message.status = "sent"
        message.sent_at = now
        message.last_error = None
        message.payload = {}


async def deliver_batch(db: Database, settings: Settings) -> None:
    if not settings.email_enabled:
        return
    for _ in range(10):
        if not await deliver_next(db, settings):
            break


async def email_delivery_loop(db: Database, settings: Settings) -> None:
    while True:
        try:
            await deliver_batch(db, settings)
        except SQLAlchemyError:
            logger.exception("email_outbox_unavailable")
        await asyncio.sleep(settings.email_poll_interval_s)
