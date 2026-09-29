from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4f1a8c2e9b3"
down_revision: str | Sequence[str] | None = "c7e2f9a1b4d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rfqs",
        sa.Column("manufacturer_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("scenario_id", sa.UUID(), nullable=True),
        sa.Column("requester_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.Enum("sent", "answered", "declined", name="rfq_status"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("share_contact", sa.Boolean(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("price_rub", sa.Float(), nullable=True),
        sa.Column("vat_included", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("lead_time_weeks", sa.Integer(), nullable=True),
        sa.Column("response_message", sa.Text(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["manufacturer_id"],
            ["manufacturers.id"],
            name=op.f("fk_rfqs_manufacturer_id_manufacturers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name=op.f("fk_rfqs_product_id_products"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name=op.f("fk_rfqs_project_id_projects"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"], ["scenarios.id"], name=op.f("fk_rfqs_scenario_id_scenarios"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["requester_id"], ["users.id"], name=op.f("fk_rfqs_requester_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rfqs")),
    )
    op.create_index(op.f("ix_rfqs_manufacturer_id"), "rfqs", ["manufacturer_id"], unique=False)
    op.create_index(op.f("ix_rfqs_project_id"), "rfqs", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_rfqs_project_id"), table_name="rfqs")
    op.drop_index(op.f("ix_rfqs_manufacturer_id"), table_name="rfqs")
    op.drop_table("rfqs")
    sa.Enum(name="rfq_status").drop(op.get_bind(), checkfirst=True)
