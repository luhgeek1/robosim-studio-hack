from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "6f268d66c3a5"
down_revision: str | Sequence[str] | None = "4eeaf0034170"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "matching_settings",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("weights", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("include_rnd", sa.Boolean(), nullable=False),
        sa.Column("process_keys", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_matching_settings_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("project_id", name=op.f("pk_matching_settings")),
    )
    op.create_table(
        "manual_candidates",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("process_key", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("offer_id", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["offer_id"],
            ["product_offers.id"],
            name=op.f("fk_manual_candidates_offer_id_product_offers"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_manual_candidates_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_manual_candidates_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_manual_candidates")),
        sa.UniqueConstraint(
            "project_id", "process_key", "product_id", name=op.f("uq_manual_candidates_project_id")
        ),
    )
    op.create_index(
        op.f("ix_manual_candidates_project_id"), "manual_candidates", ["project_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_manual_candidates_project_id"), table_name="manual_candidates")
    op.drop_table("manual_candidates")
    op.drop_table("matching_settings")
