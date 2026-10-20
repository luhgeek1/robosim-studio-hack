from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3f9b8eed7bb"
down_revision: str | Sequence[str] | None = "d6f8c20a0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_outbox",
        sa.Column("invitation_id", sa.UUID(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="queued", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_id", sa.String(length=255), nullable=True),
        sa.Column("last_error", sa.String(length=64), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["invitation_id"],
            ["organization_invitations.id"],
            name=op.f("fk_email_outbox_invitation_id_organization_invitations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_outbox")),
        sa.UniqueConstraint("invitation_id", name=op.f("uq_email_outbox_invitation_id")),
    )
    op.create_index(op.f("ix_email_outbox_status"), "email_outbox", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_email_outbox_status"), table_name="email_outbox")
    op.drop_table("email_outbox")
