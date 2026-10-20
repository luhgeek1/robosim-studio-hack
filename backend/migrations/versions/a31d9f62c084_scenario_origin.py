import sqlalchemy as sa
from alembic import op

revision = "a31d9f62c084"
down_revision = "18621daac881"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("scenarios", sa.Column("origin", sa.String(20), server_default="manual", nullable=False))
    op.add_column("scenarios", sa.Column("recommendation_key", sa.String(64), nullable=True))
    op.create_unique_constraint(
        "uq_scenarios_project_recommendation", "scenarios", ["project_id", "recommendation_key"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_scenarios_project_recommendation", "scenarios", type_="unique")
    op.drop_column("scenarios", "recommendation_key")
    op.drop_column("scenarios", "origin")
