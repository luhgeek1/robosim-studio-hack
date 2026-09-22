from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "76bc825c87ed"
down_revision: str | Sequence[str] | None = "6f268d66c3a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "object_types",
        sa.Column("site_costs", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
    )
    op.add_column("process_defs", sa.Column("labor_release", sa.Text(), nullable=True))
    op.add_column(
        "process_defs",
        sa.Column(
            "labor_release_by_type",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("process_defs", "labor_release_by_type")
    op.drop_column("process_defs", "labor_release")
    op.drop_column("object_types", "site_costs")
