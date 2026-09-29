from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.db.models import Organization, OrganizationInvitation, OrganizationMember, User
from app.db.repositories.organizations import OrganizationRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.organization import (
    IncomingInvitation,
    InvitationInfo,
    InvitationStatus,
    MemberInfo,
    OrganizationDetail,
    OrganizationInfo,
    OrganizationRole,
)

ORGANIZATION_NOT_FOUND = "Организация не найдена или вы в ней не состоите"
INVITATION_NOT_FOUND = "Приглашение не найдено или уже неактуально"


class OrganizationService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = OrganizationRepository(uow.session)

    async def mine(self) -> list[OrganizationInfo]:
        rows = await self._repo.memberships(self._user.id)
        ids = [organization.id for organization, _ in rows]
        members = await self._repo.member_counts(ids)
        projects = await self._repo.project_counts(ids)
        return [
            self._info(
                organization, member.role, members.get(organization.id, 0), projects.get(organization.id, 0)
            )
            for organization, member in rows
        ]

    async def create(self, name: str) -> OrganizationInfo:
        organization = Organization(name=name.strip(), created_by=self._user.id)
        self._repo.add(organization)
        await self._uow.flush()
        self._repo.add(
            OrganizationMember(
                organization_id=organization.id, user_id=self._user.id, role=OrganizationRole.OWNER
            )
        )
        await self._uow.flush()
        return self._info(organization, OrganizationRole.OWNER, 1, 0)

    async def detail(self, organization_id: UUID) -> OrganizationDetail:
        organization, member = await self._member(organization_id)
        rows = await self._repo.members(organization_id)
        invitations = await self._repo.pending_invitations(organization_id)
        registered = await self._repo.users_by_email([i.email for i in invitations])
        inviters = await self._repo.users({i.invited_by for i in invitations if i.invited_by})
        projects = await self._repo.project_counts([organization_id])
        return OrganizationDetail(
            organization=self._info(organization, member.role, len(rows), projects.get(organization_id, 0)),
            members=[
                MemberInfo(
                    user_id=user.id, email=user.email, name=user.name, role=m.role, joined_at=m.created_at
                )
                for m, user in rows
            ],
            invitations=[
                InvitationInfo(
                    id=i.id,
                    email=i.email,
                    status=i.status,
                    created_at=i.created_at,
                    invited_by_name=_name(inviters.get(i.invited_by) if i.invited_by else None),
                    invitee_registered=i.email.lower() in registered,
                )
                for i in invitations
            ],
        )

    async def rename(self, organization_id: UUID, name: str) -> OrganizationInfo:
        organization, _ = await self._owner(organization_id)
        organization.name = name.strip()
        organization.updated_at = datetime.now(UTC)
        await self._uow.flush()
        return (await self.detail(organization_id)).organization

    async def delete(self, organization_id: UUID) -> None:
        organization, _ = await self._owner(organization_id)
        await self._repo.delete(organization)
        await self._uow.flush()

    async def invite(self, organization_id: UUID, email: str) -> InvitationInfo:
        await self._owner(organization_id)
        address = email.strip().lower()
        invitee = (await self._repo.users_by_email([address])).get(address)
        if invitee and await self._repo.membership(organization_id, invitee.id):
            raise ConflictError("Этот пользователь уже в организации")
        if await self._repo.pending_invitation(organization_id, address):
            raise ConflictError("Приглашение на этот адрес уже отправлено и ждёт ответа")
        invitation = OrganizationInvitation(
            organization_id=organization_id,
            email=address,
            invited_by=self._user.id,
            status=InvitationStatus.PENDING,
        )
        self._repo.add(invitation)
        await self._uow.flush()
        inviter = await self._uow.users.get(self._user.id)
        return InvitationInfo(
            id=invitation.id,
            email=invitation.email,
            status=invitation.status,
            created_at=invitation.created_at,
            invited_by_name=_name(inviter),
            invitee_registered=invitee is not None,
        )

    async def revoke(self, organization_id: UUID, invitation_id: UUID) -> None:
        await self._owner(organization_id)
        invitation = await self._repo.invitation(invitation_id, lock=True)
        if (
            invitation is None
            or invitation.organization_id != organization_id
            or invitation.status != InvitationStatus.PENDING
        ):
            raise NotFoundError(INVITATION_NOT_FOUND)
        invitation.status = InvitationStatus.REVOKED
        invitation.responded_at = datetime.now(UTC)
        await self._uow.flush()

    async def remove_member(self, organization_id: UUID, user_id: UUID) -> None:
        """An owner removes anyone; a member can only leave. The last owner cannot leave — delete instead."""
        _, me = await self._member(organization_id)
        if user_id != self._user.id and me.role != OrganizationRole.OWNER:
            raise ForbiddenError("Удалять участников может только владелец организации")
        target = await self._repo.membership(organization_id, user_id)
        if target is None:
            raise NotFoundError("Участник не найден")
        if target.role == OrganizationRole.OWNER and await self._repo.owners_count(organization_id) == 1:
            raise ConflictError(
                "В организации не останется владельца: передайте права или удалите организацию"
            )
        await self._repo.delete(target)
        await self._uow.flush()

    async def incoming(self) -> list[IncomingInvitation]:
        rows = await self._repo.pending_for_email(self._user.email)
        return [
            IncomingInvitation(
                id=invitation.id,
                organization_id=organization.id,
                organization_name=organization.name,
                invited_by_name=_name(inviter),
                invited_by_email=inviter.email if inviter else None,
                created_at=invitation.created_at,
            )
            for invitation, organization, inviter in rows
        ]

    async def accept(self, invitation_id: UUID) -> OrganizationInfo:
        invitation = await self._incoming(invitation_id)
        invitation.status = InvitationStatus.ACCEPTED
        invitation.responded_at = datetime.now(UTC)
        if await self._repo.membership(invitation.organization_id, self._user.id) is None:
            self._repo.add(
                OrganizationMember(
                    organization_id=invitation.organization_id,
                    user_id=self._user.id,
                    role=OrganizationRole.MEMBER,
                )
            )
        await self._uow.flush()
        return (await self.detail(invitation.organization_id)).organization

    async def decline(self, invitation_id: UUID) -> None:
        invitation = await self._incoming(invitation_id)
        invitation.status = InvitationStatus.DECLINED
        invitation.responded_at = datetime.now(UTC)
        await self._uow.flush()

    async def _incoming(self, invitation_id: UUID) -> OrganizationInvitation:
        invitation = await self._repo.invitation(invitation_id, lock=True)
        if (
            invitation is None
            or invitation.email.lower() != self._user.email.lower()
            or invitation.status != InvitationStatus.PENDING
        ):
            raise NotFoundError(INVITATION_NOT_FOUND)
        return invitation

    async def _member(self, organization_id: UUID) -> tuple[Organization, OrganizationMember]:
        organization = await self._repo.get(organization_id)
        member = await self._repo.membership(organization_id, self._user.id) if organization else None
        if organization is None or member is None:
            raise NotFoundError(ORGANIZATION_NOT_FOUND)
        return organization, member

    async def _owner(self, organization_id: UUID) -> tuple[Organization, OrganizationMember]:
        organization, member = await self._member(organization_id)
        if member.role != OrganizationRole.OWNER:
            raise ForbiddenError("Это может сделать только владелец организации")
        return organization, member

    @staticmethod
    def _info(
        organization: Organization, role: OrganizationRole, members: int, projects: int
    ) -> OrganizationInfo:
        return OrganizationInfo(
            id=organization.id,
            name=organization.name,
            role=role,
            members_count=members,
            projects_count=projects,
            created_at=organization.created_at,
        )


def _name(user: User | None) -> str | None:
    return (user.name or user.email) if user else None
