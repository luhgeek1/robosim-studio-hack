from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Organization, OrganizationInvitation, OrganizationMember, Project, User
from app.domain.organization import InvitationStatus, OrganizationRole


class OrganizationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, item: Organization | OrganizationMember | OrganizationInvitation) -> None:
        self._session.add(item)

    async def delete(self, item: Organization | OrganizationMember) -> None:
        await self._session.delete(item)

    async def get(self, organization_id: UUID) -> Organization | None:
        return await self._session.get(Organization, organization_id)

    async def membership(self, organization_id: UUID, user_id: UUID) -> OrganizationMember | None:
        return await self._session.get(OrganizationMember, (organization_id, user_id))

    async def memberships(self, user_id: UUID) -> Sequence[tuple[Organization, OrganizationMember]]:
        statement = (
            select(Organization, OrganizationMember)
            .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
            .where(OrganizationMember.user_id == user_id)
            .order_by(Organization.name, Organization.id)
        )
        return (await self._session.execute(statement)).tuples().all()

    async def member_counts(self, organization_ids: Sequence[UUID]) -> dict[UUID, int]:
        if not organization_ids:
            return {}
        statement = (
            select(OrganizationMember.organization_id, func.count())
            .where(OrganizationMember.organization_id.in_(organization_ids))
            .group_by(OrganizationMember.organization_id)
        )
        return dict((await self._session.execute(statement)).tuples().all())

    async def project_counts(self, organization_ids: Sequence[UUID]) -> dict[UUID, int]:
        if not organization_ids:
            return {}
        statement = (
            select(Project.organization_id, func.count())
            .where(Project.organization_id.in_(organization_ids))
            .group_by(Project.organization_id)
        )
        return {
            org_id: count for org_id, count in (await self._session.execute(statement)).tuples() if org_id
        }

    async def owners_count(self, organization_id: UUID) -> int:
        statement = select(func.count()).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.role == OrganizationRole.OWNER,
        )
        return int(await self._session.scalar(statement) or 0)

    async def members(self, organization_id: UUID) -> Sequence[tuple[OrganizationMember, User]]:
        statement = (
            select(OrganizationMember, User)
            .join(User, User.id == OrganizationMember.user_id)
            .where(OrganizationMember.organization_id == organization_id)
            .order_by(OrganizationMember.created_at, User.email)
        )
        return (await self._session.execute(statement)).tuples().all()

    async def pending_invitations(self, organization_id: UUID) -> Sequence[OrganizationInvitation]:
        statement = (
            select(OrganizationInvitation)
            .where(
                OrganizationInvitation.organization_id == organization_id,
                OrganizationInvitation.status == InvitationStatus.PENDING,
            )
            .order_by(OrganizationInvitation.created_at.desc())
        )
        return (await self._session.scalars(statement)).all()

    async def pending_for_email(
        self, email: str
    ) -> Sequence[tuple[OrganizationInvitation, Organization, User | None]]:
        statement = (
            select(OrganizationInvitation, Organization, User)
            .join(Organization, Organization.id == OrganizationInvitation.organization_id)
            .outerjoin(User, User.id == OrganizationInvitation.invited_by)
            .where(
                OrganizationInvitation.email == email,
                OrganizationInvitation.status == InvitationStatus.PENDING,
            )
            .order_by(OrganizationInvitation.created_at.desc())
        )
        return (await self._session.execute(statement)).tuples().all()

    async def invitation(self, invitation_id: UUID, *, lock: bool = False) -> OrganizationInvitation | None:
        statement = select(OrganizationInvitation).where(OrganizationInvitation.id == invitation_id)
        if lock:
            statement = statement.with_for_update()
        invitation: OrganizationInvitation | None = await self._session.scalar(statement)
        return invitation

    async def pending_invitation(self, organization_id: UUID, email: str) -> OrganizationInvitation | None:
        statement = select(OrganizationInvitation).where(
            OrganizationInvitation.organization_id == organization_id,
            OrganizationInvitation.email == email,
            OrganizationInvitation.status == InvitationStatus.PENDING,
        )
        invitation: OrganizationInvitation | None = await self._session.scalar(statement)
        return invitation

    async def users_by_email(self, emails: Sequence[str]) -> dict[str, User]:
        if not emails:
            return {}
        rows = await self._session.scalars(select(User).where(User.email.in_(emails)))
        return {user.email.lower(): user for user in rows}

    async def users(self, ids: set[UUID]) -> dict[UUID, User]:
        if not ids:
            return {}
        return {u.id: u for u in await self._session.scalars(select(User).where(User.id.in_(ids)))}
