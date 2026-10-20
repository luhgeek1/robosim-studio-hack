from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.api.schemas.base import ApiModel


class EmailRequest(ApiModel):
    email: EmailStr


class EmailTokenRequest(ApiModel):
    token: str = Field(min_length=20, max_length=256)


class PasswordReset(EmailTokenRequest):
    password: str = Field(min_length=8, max_length=128)


class PasswordChange(ApiModel):
    password: str = Field(min_length=8, max_length=128)
    current_password: str | None = Field(default=None, max_length=128)


class EmailAccepted(ApiModel):
    message: str = (
        "Если действие доступно для этого адреса, письмо будет отправлено. Проверьте почту и папку «Спам»."
    )


class ConnectedIdentity(ApiModel):
    provider: str
    connected_at: datetime


class AccountSession(ApiModel):
    id: UUID
    method: str
    client: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    current: bool


class AccountSecurity(ApiModel):
    has_password: bool
    email_verified: bool
    identities: list[ConnectedIdentity]
    sessions: list[AccountSession]
