import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from html import escape

from app.core.config import Settings
from app.db.models import EmailOutbox, OrganizationInvitation
from app.db.uow import UnitOfWork


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
