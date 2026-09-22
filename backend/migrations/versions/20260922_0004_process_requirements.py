from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4eeaf0034170"
down_revision: str | Sequence[str] | None = "765b1e4e2a8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("process_defs", sa.Column("route_length", sa.Text(), nullable=True))
    op.add_column("process_defs", sa.Column("unit_weight", sa.Text(), nullable=True))
    op.add_column(
        "process_defs",
        sa.Column(
            "requirements", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_column("process_defs", "requirements")
    op.drop_column("process_defs", "unit_weight")
    op.drop_column("process_defs", "route_length")
