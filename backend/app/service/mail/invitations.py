import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.core.config import Settings
from app.core.errors import NotFoundError
from app.db.models import EmailOutbox, Organization, OrganizationInvitation
from app.db.uow import UnitOfWork
from app.domain.organization import InvitationStatus
from app.domain.organization.models import InvitationPreview
from app.service.mail.templates import EmailMessage, render_email


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def queue_invitation(
    uow: UnitOfWork, settings: Settings, invitation: OrganizationInvitation, organization: str, inviter: str
) -> None:
    token = secrets.token_urlsafe(32)
    invitation.token_hash = token_hash(token)
    invitation.expires_at = datetime.now(UTC) + timedelta(hours=settings.invitation_ttl_hours)
    link = f"{settings.public_web_url.rstrip('/')}/invitations/{invitation.id}#token={token}"
    expiry = invitation.expires_at.strftime("%d.%m.%Y, %H:%M UTC")
    subject = "Приглашение в команду РобоМеры"
    text = (
        f"{inviter} приглашает вас в команду «{organization}» в РобоМере.\n\n"
        f"Открыть приглашение: {link}\n\n"
        f"Войдите или зарегистрируйтесь с адресом {invitation.email}, затем подтвердите вступление.\n"
        f"Ссылка действует до {expiry}. Если вы не ждали письмо, проигнорируйте его."
    )
    html = render_email(
        EmailMessage(
            preview=f"{inviter} приглашает вас в команду «{organization}» в РобоМере.",
            title="Вас приглашают в команду",
            paragraphs=(
                f"{inviter} приглашает вас в «{organization}» в РобоМере.",
                "Работайте с объектами и сценариями вместе: от исходных данных до расчёта и отчёта.",
                f"Войдите или создайте аккаунт с почтой {invitation.email}, затем подтвердите вступление.",
            ),
            action_label="Открыть приглашение",
            action_url=link,
            facts=(("Команда", organization), ("Для кого", invitation.email), ("Действует до", expiry)),
            footnote=(
                "Вступление подтверждается на сайте. Если вы не ждали приглашение, проигнорируйте письмо."
            ),
        ),
        settings.public_web_url,
    )
    uow.session.add(
        EmailOutbox(
            invitation_id=invitation.id,
            payload={
                "from": settings.email_from,
                "to": [invitation.email],
                "subject": subject,
                "html": html,
                "text": text,
            },
        )
    )


async def preview_invitation(uow: UnitOfWork, invitation_id: UUID, token: str) -> InvitationPreview:
    invitation = await uow.session.get(OrganizationInvitation, invitation_id)
    if (
        invitation is None
        or invitation.status != InvitationStatus.PENDING
        or not invitation.token_hash
        or (invitation.expires_at is None or invitation.expires_at <= datetime.now(UTC))
        or not secrets.compare_digest(invitation.token_hash, token_hash(token))
    ):
        raise NotFoundError("Приглашение не найдено, отозвано или срок ссылки истёк")
    organization = await uow.session.get(Organization, invitation.organization_id)
    if organization is None:
        raise NotFoundError("Организация больше не существует")
    inviter = await uow.users.get(invitation.invited_by) if invitation.invited_by else None
    return InvitationPreview(
        id=invitation.id,
        email=invitation.email,
        organization_name=organization.name,
        invited_by_name=inviter.name if inviter else None,
        expires_at=invitation.expires_at,
    )
