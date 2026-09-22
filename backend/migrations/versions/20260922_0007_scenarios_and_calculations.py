from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "5c82d8ddcb4a"
down_revision: str | Sequence[str] | None = "76bc825c87ed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "kind", sa.Enum("baseline", "purchase", "raas", "lease", name="scenario_kind"), nullable=False
        ),
        sa.Column("is_baseline", sa.Boolean(), nullable=False),
        sa.Column("financing", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("horizon_years", sa.Integer(), nullable=True),
        sa.Column("discount_rate_pct", sa.Float(), nullable=True),
        sa.Column("overrides", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_recommended", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name=op.f("fk_scenarios_project_id_projects"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenarios")),
    )
    op.create_index("ix_scenarios_project_created", "scenarios", ["project_id", "created_at"], unique=False)
    op.create_index(
        "uq_scenarios_one_baseline",
        "scenarios",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("is_baseline"),
    )
    op.create_table(
        "calculation_runs",
        sa.Column("scenario_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("scenario_kind", postgresql.ENUM(name="scenario_kind", create_type=False), nullable=False),
        sa.Column("project_version", sa.Integer(), nullable=False),
        sa.Column("scenario_version", sa.Integer(), nullable=False),
        sa.Column("catalog_version", sa.String(length=32), nullable=False),
        sa.Column("norm_set_version", sa.String(length=32), nullable=False),
        sa.Column("engine_version", sa.String(length=16), nullable=False),
        sa.Column("layout_version", sa.Integer(), nullable=True),
        sa.Column("inputs_hash", sa.String(length=64), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("capex_rub", sa.Float(), nullable=False),
        sa.Column("effect_rub_year", sa.Float(), nullable=False),
        sa.Column("npv_rub", sa.Float(), nullable=False),
        sa.Column("payback_years", sa.Float(), nullable=True),
        sa.Column("verdict", sa.String(length=32), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("trace", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_calculation_runs_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["scenarios.id"],
            name=op.f("fk_calculation_runs_scenario_id_scenarios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calculation_runs")),
    )
    op.create_index(op.f("ix_calculation_runs_project_id"), "calculation_runs", ["project_id"], unique=False)
    op.create_index(
        "ix_calculation_runs_scenario_computed",
        "calculation_runs",
        ["scenario_id", "computed_at"],
        unique=False,
    )
    op.create_table(
        "scenario_items",
        sa.Column("scenario_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("process_key", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("offer_id", sa.UUID(), nullable=True),
        sa.Column("count_mode", sa.Enum("auto", "manual", name="count_mode"), nullable=False),
        sa.Column("count_manual", sa.Integer(), nullable=True),
        sa.Column("stations_mode", postgresql.ENUM(name="count_mode", create_type=False), nullable=False),
        sa.Column("stations_count", sa.Integer(), nullable=True),
        sa.Column("price_override_rub", sa.Float(), nullable=True),
        sa.Column("throughput_override_per_hour", sa.Float(), nullable=True),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["offer_id"],
            ["product_offers.id"],
            name=op.f("fk_scenario_items_offer_id_product_offers"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_scenario_items_product_id_products"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scenario_id"],
            ["scenarios.id"],
            name=op.f("fk_scenario_items_scenario_id_scenarios"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenario_items")),
        sa.UniqueConstraint("scenario_id", "process_key", name=op.f("uq_scenario_items_scenario_id")),
    )
    op.create_index(op.f("ix_scenario_items_scenario_id"), "scenario_items", ["scenario_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scenario_items_scenario_id"), table_name="scenario_items")
    op.drop_table("scenario_items")
    op.drop_index("ix_calculation_runs_scenario_computed", table_name="calculation_runs")
    op.drop_index(op.f("ix_calculation_runs_project_id"), table_name="calculation_runs")
    op.drop_table("calculation_runs")
    op.drop_index(
        "uq_scenarios_one_baseline", table_name="scenarios", postgresql_where=sa.text("is_baseline")
    )
    op.drop_index("ix_scenarios_project_created", table_name="scenarios")
    op.drop_table("scenarios")
    sa.Enum(name="count_mode").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="scenario_kind").drop(op.get_bind(), checkfirst=True)
