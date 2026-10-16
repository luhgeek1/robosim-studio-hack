from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1b7e89e9773"
down_revision: str | Sequence[str] | None = "d4f1a8c2e9b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("scenario_items", sa.Column("simulated_fingerprint", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("scenario_items", "simulated_fingerprint")
