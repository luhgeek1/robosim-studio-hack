from datetime import datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UuidPkMixin, utcnow


class EmailOutbox(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "email_outbox"

    invitation_id: Mapped[UUID | None] = mapped_column(
        sa.ForeignKey("organization_invitations.id", ondelete="CASCADE"), unique=True
    )
    auth_email_token_id: Mapped[UUID | None] = mapped_column(
        sa.ForeignKey("auth_email_tokens.id", ondelete="CASCADE"), unique=True
    )
    __table_args__ = (
        sa.CheckConstraint("num_nonnulls(invitation_id, auth_email_token_id) = 1", name="one_reference"),
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(sa.String(16), default="queued", server_default="queued", index=True)
    attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    provider_id: Mapped[str | None] = mapped_column(sa.String(255))
    last_error: Mapped[str | None] = mapped_column(sa.String(64))
