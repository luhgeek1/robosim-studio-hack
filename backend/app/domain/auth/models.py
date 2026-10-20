from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from app.domain.auth.permissions import Permission, Role, has_permission


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: UUID
    email: str
    role: Role
    auth_version: int
    session_id: UUID | None = None

    def can(self, permission: Permission) -> bool:
        return has_permission(self.role, permission)


@dataclass(frozen=True, slots=True)
class UserProfile:
    id: UUID
    email: str
    name: str
    role: Role
    organization: str | None
    position: str | None
    vendor_manufacturer_id: UUID | None
    created_at: datetime
    last_login_at: datetime | None
    is_active: bool
    guest_expires_at: datetime | None = None
    email_verified: bool = False


@dataclass(frozen=True, slots=True)
class ApiKeyInfo:
    id: UUID
    name: str
    prefix: str
    scopes: tuple[str, ...]
    created_at: datetime
    last_used_at: datetime | None
