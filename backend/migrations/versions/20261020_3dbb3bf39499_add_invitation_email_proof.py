from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3dbb3bf39499"
down_revision: str | Sequence[str] | None = "c3f9b8eed7bb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organization_invitations", sa.Column("token_hash", sa.String(length=64), nullable=True))
    op.add_column(
        "organization_invitations", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("organization_invitations", "expires_at")
    op.drop_column("organization_invitations", "token_hash")
