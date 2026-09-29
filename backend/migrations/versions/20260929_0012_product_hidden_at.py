from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9d4e1a2b3c60"
down_revision: str | Sequence[str] | None = "7b1c2d3e4f50"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("products", sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "hidden_at")
