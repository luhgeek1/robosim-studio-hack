from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID


class OrganizationRole(StrEnum):
    OWNER = "owner"
    MEMBER = "member"


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    REVOKED = "revoked"


@dataclass(frozen=True, slots=True)
class OrganizationInfo:
    id: UUID
    name: str
    role: OrganizationRole
    members_count: int
    projects_count: int
    created_at: datetime


@dataclass(frozen=True, slots=True)
class MemberInfo:
    user_id: UUID
    email: str
    name: str
    role: OrganizationRole
    joined_at: datetime


@dataclass(frozen=True, slots=True)
class InvitationInfo:
    id: UUID
    email: str
    status: InvitationStatus
    created_at: datetime
    invited_by_name: str | None
    invitee_registered: bool


@dataclass(frozen=True, slots=True)
class OrganizationDetail:
    organization: OrganizationInfo
    members: list[MemberInfo]
    invitations: list[InvitationInfo]


@dataclass(frozen=True, slots=True)
class IncomingInvitation:
    id: UUID
    organization_id: UUID
    organization_name: str
    invited_by_name: str | None
    invited_by_email: str | None
    created_at: datetime
