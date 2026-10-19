"""Expiring guest identities use the ordinary project ownership model."""

import sqlalchemy as sa
from alembic import op

revision = "d6f8c20a0017"
down_revision = "f1b7e89e9773"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("guest_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_guest_expires_at", "users", ["guest_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_users_guest_expires_at", table_name="users")
    op.drop_column("users", "guest_expires_at")
