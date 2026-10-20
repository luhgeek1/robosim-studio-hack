from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class OAuthProvider(StrEnum):
    YANDEX = "yandex"
    GOOGLE = "google"
    VK = "vk"


@dataclass(frozen=True, slots=True)
class RemoteIdentity:
    subject: str
    email: str | None
    name: str
    email_verified: bool = False


@dataclass(frozen=True, slots=True)
class IdentityInfo:
    provider: str
    connected_at: datetime


@dataclass(frozen=True, slots=True)
class SessionInfo:
    id: UUID
    method: str
    client: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    current: bool


@dataclass(frozen=True, slots=True)
class AccountSecurity:
    has_password: bool
    email_verified: bool
    identities: list[IdentityInfo]
    sessions: list[SessionInfo]
