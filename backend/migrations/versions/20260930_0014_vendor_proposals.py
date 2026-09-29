from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c7e2f9a1b4d8"
down_revision: str | Sequence[str] | None = "b3a8e0c41d27"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vendor_proposals",
        sa.Column("manufacturer_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=True),
        sa.Column("kind", sa.Enum("new_product", "update", name="proposal_kind"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "approved", "rejected", "withdrawn", name="proposal_status"),
            nullable=False,
        ),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("card", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("specs", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("catalog_version", sa.String(length=32), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("reviewer_id", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_comment", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["manufacturer_id"],
            ["manufacturers.id"],
            name=op.f("fk_vendor_proposals_manufacturer_id_manufacturers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_vendor_proposals_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_vendor_proposals_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reviewer_id"],
            ["users.id"],
            name=op.f("fk_vendor_proposals_reviewer_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vendor_proposals")),
    )
    op.create_index(
        op.f("ix_vendor_proposals_manufacturer_id"), "vendor_proposals", ["manufacturer_id"], unique=False
    )
    op.create_index(op.f("ix_vendor_proposals_status"), "vendor_proposals", ["status"], unique=False)
    op.create_index(
        "uq_vendor_proposals_pending_product",
        "vendor_proposals",
        ["product_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending' AND product_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_vendor_proposals_pending_product", table_name="vendor_proposals")
    op.drop_index(op.f("ix_vendor_proposals_status"), table_name="vendor_proposals")
    op.drop_index(op.f("ix_vendor_proposals_manufacturer_id"), table_name="vendor_proposals")
    op.drop_table("vendor_proposals")
    for enum_name in ("proposal_status", "proposal_kind"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
