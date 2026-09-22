from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "4e0df30ae3c5"
down_revision: str | Sequence[str] | None = "ca92a8e44160"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "simulation_runs",
        sa.Column("scenario_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("job_id", sa.UUID(), nullable=True),
        sa.Column("calculation_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(name="job_status", create_type=False),
            nullable=False,
        ),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("stage", sa.String(length=255), nullable=True),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("engine_input", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("versions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("layout_id", sa.UUID(), nullable=False),
        sa.Column("layout_version", sa.Integer(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("fleet", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("timeline", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("heatmap", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("robots", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("events", sa.LargeBinary(), nullable=True),
        sa.Column("events_count", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["calculation_id"],
            ["calculation_runs.id"],
            name=op.f("fk_simulation_runs_calculation_id_calculation_runs"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"], name=op.f("fk_simulation_runs_job_id_jobs"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["layout_id"],
            ["layouts.id"],
            name=op.f("fk_simulation_runs_layout_id_layouts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_simulation_runs_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["scenarios.id"],
            name=op.f("fk_simulation_runs_scenario_id_scenarios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_simulation_runs")),
    )
    op.create_index(op.f("ix_simulation_runs_project_id"), "simulation_runs", ["project_id"], unique=False)
    op.create_index(
        "ix_simulation_runs_scenario_created", "simulation_runs", ["scenario_id", "created_at"], unique=False
    )
    op.add_column("jobs", sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column(
        "process_defs", sa.Column("simulation", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )
    op.add_column("scenario_items", sa.Column("simulated_count", sa.Integer(), nullable=True))
    op.add_column("scenario_items", sa.Column("simulation_id", sa.UUID(), nullable=True))
    op.add_column("scenario_items", sa.Column("simulated_project_version", sa.Integer(), nullable=True))
    op.add_column("scenario_items", sa.Column("simulation_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        op.f("fk_scenario_items_simulation_id_simulation_runs"),
        "scenario_items",
        "simulation_runs",
        ["simulation_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_scenario_items_simulation_id_simulation_runs"), "scenario_items", type_="foreignkey"
    )
    op.drop_column("scenario_items", "simulation_note")
    op.drop_column("scenario_items", "simulated_project_version")
    op.drop_column("scenario_items", "simulation_id")
    op.drop_column("scenario_items", "simulated_count")
    op.drop_column("process_defs", "simulation")
    op.drop_column("jobs", "result")
    op.drop_index("ix_simulation_runs_scenario_created", table_name="simulation_runs")
    op.drop_index(op.f("ix_simulation_runs_project_id"), table_name="simulation_runs")
    op.drop_table("simulation_runs")
