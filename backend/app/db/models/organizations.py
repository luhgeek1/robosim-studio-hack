import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UuidPkMixin, pg_enum
from app.domain.organization import InvitationStatus, OrganizationRole


class Organization(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(sa.String(120))
    created_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))


class OrganizationMember(CreatedAtMixin, Base):
    __tablename__ = "organization_members"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[OrganizationRole] = mapped_column(pg_enum(OrganizationRole, "organization_role"))


class OrganizationInvitation(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "organization_invitations"
    # One open invitation per address: a repeated invite answers 409 instead of spamming the bell.
    __table_args__ = (
        sa.Index(
            "uq_organization_invitations_pending",
            "organization_id",
            "email",
            unique=True,
            postgresql_where=sa.text("status = 'pending'"),
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(CITEXT, index=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[InvitationStatus] = mapped_column(
        pg_enum(InvitationStatus, "invitation_status"), default=InvitationStatus.PENDING
    )
    responded_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
