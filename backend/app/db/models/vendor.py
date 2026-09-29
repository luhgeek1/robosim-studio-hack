import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UuidPkMixin, pg_enum
from app.domain.vendor import ProposalKind, ProposalStatus, RfqStatus


class VendorProposal(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "vendor_proposals"
    # One open proposal per product: a second one would race the first at moderation.
    __table_args__ = (
        sa.Index(
            "uq_vendor_proposals_pending_product",
            "product_id",
            unique=True,
            postgresql_where=sa.text("status = 'pending' AND product_id IS NOT NULL"),
        ),
    )

    manufacturer_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("manufacturers.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("products.id", ondelete="CASCADE"))
    kind: Mapped[ProposalKind] = mapped_column(pg_enum(ProposalKind, "proposal_kind"))
    status: Mapped[ProposalStatus] = mapped_column(
        pg_enum(ProposalStatus, "proposal_status"), default=ProposalStatus.PENDING, index=True
    )
    product_name: Mapped[str] = mapped_column(sa.String(255))
    card: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    specs: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    comment: Mapped[str] = mapped_column(sa.Text)
    catalog_version: Mapped[str] = mapped_column(sa.String(32))
    author_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    review_comment: Mapped[str | None] = mapped_column(sa.Text)


class Rfq(UuidPkMixin, TimestampMixin, Base):
    """A buyer's request for an offer; the vendor sees the object snapshot, never the live project."""

    __tablename__ = "rfqs"

    manufacturer_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("manufacturers.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("products.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    scenario_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("scenarios.id", ondelete="SET NULL"))
    requester_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[RfqStatus] = mapped_column(pg_enum(RfqStatus, "rfq_status"), default=RfqStatus.SENT)
    quantity: Mapped[int | None] = mapped_column(sa.Integer)
    message: Mapped[str | None] = mapped_column(sa.Text)
    share_contact: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    price_rub: Mapped[float | None] = mapped_column(sa.Float)
    vat_included: Mapped[bool] = mapped_column(sa.Boolean, default=True, server_default=sa.true())
    lead_time_weeks: Mapped[int | None] = mapped_column(sa.Integer)
    response_message: Mapped[str | None] = mapped_column(sa.Text)
    responded_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
