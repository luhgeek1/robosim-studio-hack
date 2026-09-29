from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, EmailStr, Field

from app.api.schemas.base import ApiModel
from app.domain.organization import (
    IncomingInvitation as IncomingInvitationInfo,
    InvitationInfo,
    InvitationStatus,
    MemberInfo,
    OrganizationDetail as OrganizationDetailInfo,
    OrganizationInfo,
    OrganizationRole,
)


class Organization(ApiModel):
    id: UUID
    name: str = Field(examples=["ООО «Логистика Север»"])
    role: OrganizationRole
    members_count: int
    projects_count: int
    created_at: datetime

    @classmethod
    def from_domain(cls, item: OrganizationInfo) -> "Organization":
        return cls.model_validate(item)


class OrganizationList(ApiModel):
    items: list[Organization]


class OrganizationWrite(ApiModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)


class OrganizationMember(ApiModel):
    user_id: UUID
    email: EmailStr
    name: str
    role: OrganizationRole
    joined_at: datetime

    @classmethod
    def from_domain(cls, item: MemberInfo) -> "OrganizationMember":
        return cls.model_validate(item)


class OrganizationInvitation(ApiModel):
    id: UUID
    email: EmailStr
    status: InvitationStatus
    created_at: datetime
    invited_by_name: str | None = None
    invitee_registered: bool

    @classmethod
    def from_domain(cls, item: InvitationInfo) -> "OrganizationInvitation":
        return cls.model_validate(item)


class OrganizationDetail(Organization):
    members: list[OrganizationMember]
    invitations: list[OrganizationInvitation]

    @classmethod
    def from_detail(cls, item: OrganizationDetailInfo) -> "OrganizationDetail":
        return cls(
            **Organization.from_domain(item.organization).model_dump(),
            members=[OrganizationMember.from_domain(m) for m in item.members],
            invitations=[OrganizationInvitation.from_domain(i) for i in item.invitations],
        )


class InvitationCreate(ApiModel):
    email: EmailStr


class IncomingInvitation(ApiModel):
    id: UUID
    organization_id: UUID
    organization_name: str
    invited_by_name: str | None = None
    invited_by_email: str | None = None
    created_at: datetime

    @classmethod
    def from_domain(cls, item: IncomingInvitationInfo) -> "IncomingInvitation":
        return cls.model_validate(item)


class IncomingInvitationList(ApiModel):
    items: list[IncomingInvitation]
