from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "18621daac881"
down_revision: str | Sequence[str] | None = "792d530cc51b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("auth_email_tokens", sa.Column("email", postgresql.CITEXT(), nullable=True))
    op.add_column(
        "auth_email_tokens", sa.Column("auth_version", sa.Integer(), server_default="1", nullable=False)
    )

    op.execute(
        "UPDATE auth_email_tokens t SET email = u.email, auth_version = u.auth_version, consumed_at = coalesce(t.consumed_at, now()) FROM users u WHERE u.id = t.user_id"
    )
    op.alter_column("auth_email_tokens", "email", existing_type=postgresql.CITEXT(), nullable=False)


def downgrade() -> None:
    op.drop_column("auth_email_tokens", "auth_version")
    op.drop_column("auth_email_tokens", "email")
