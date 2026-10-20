import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from html import escape
from uuid import UUID

from app.core.config import Settings
from app.core.errors import NotFoundError
from app.db.models import EmailOutbox, Organization, OrganizationInvitation
from app.db.uow import UnitOfWork
from app.domain.organization import InvitationStatus
from app.domain.organization.models import InvitationPreview


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def queue_invitation(
    uow: UnitOfWork, settings: Settings, invitation: OrganizationInvitation, organization: str, inviter: str
) -> None:
    token = secrets.token_urlsafe(32)
    invitation.token_hash = token_hash(token)
    invitation.expires_at = datetime.now(UTC) + timedelta(hours=settings.invitation_ttl_hours)
    link = f"{settings.public_web_url.rstrip('/')}/invitations/{invitation.id}#token={token}"
    subject = "Приглашение в команду РобоМеры"
    text = (
        f"{inviter} приглашает вас в команду «{organization}» в РобоМере.\n\n"
        f"Открыть приглашение: {link}\n\n"
        f"Войдите или зарегистрируйтесь с адресом {invitation.email}, затем подтвердите вступление.\n"
        f"Ссылка действует {settings.invitation_ttl_hours} ч. Если вы не ждали письмо, проигнорируйте его."
    )
    html = (
        '<html lang="ru"><body style="font-family:Arial,sans-serif;color:#141413;line-height:1.6">'
        '<h1 style="font-size:24px">Вас приглашают в команду</h1>'
        f"<p>{escape(inviter)} приглашает вас в «{escape(organization)}» в РобоМере.</p>"
        f'<p><a href="{escape(link, quote=True)}">Открыть приглашение</a></p>'
        f"<p>Войдите или зарегистрируйтесь с адресом {escape(invitation.email)}, "
        "затем подтвердите вступление.</p>"
        f"<p>Ссылка действует {settings.invitation_ttl_hours} ч. "
        "Если вы не ждали письмо, проигнорируйте его.</p></body></html>"
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
