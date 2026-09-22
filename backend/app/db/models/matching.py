import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UuidPkMixin, utcnow


class MatchingSettings(Base):
    __tablename__ = "matching_settings"

    project_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    weights: Mapped[dict[str, float]] = mapped_column(JSONB, default=dict)
    include_rnd: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    process_keys: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ManualCandidate(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "manual_candidates"
    __table_args__ = (sa.UniqueConstraint("project_id", "process_key", "product_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    process_key: Mapped[str] = mapped_column(sa.String(64))
    product_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("products.id", ondelete="CASCADE"))
    offer_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("product_offers.id", ondelete="SET NULL")
    )
    created_by: Mapped[str] = mapped_column(sa.String(255))
