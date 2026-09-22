from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "ca92a8e44160"
down_revision: str | Sequence[str] | None = "5c82d8ddcb4a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_NORM_CATEGORIES_BEFORE = ("capex", "opex", "labor", "finance", "operations", "simulation", "sizing", "risk")


def upgrade() -> None:
    op.execute("ALTER TYPE norm_category ADD VALUE IF NOT EXISTS 'layout'")
    op.create_table(
        "stored_files",
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_stored_files_owner_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_stored_files_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stored_files")),
    )
    op.create_index(op.f("ix_stored_files_owner_id"), "stored_files", ["owner_id"], unique=False)
    op.create_index(op.f("ix_stored_files_project_id"), "stored_files", ["project_id"], unique=False)
    op.create_table(
        "layouts",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("template", sa.String(length=64), nullable=True),
        sa.Column("width_m", sa.Float(), nullable=False),
        sa.Column("height_m", sa.Float(), nullable=False),
        sa.Column("zones", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("racks", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("nodes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("edges", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generated", sa.Boolean(), nullable=False),
        sa.Column("generator", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("derivation", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("background_file_id", sa.UUID(), nullable=True),
        sa.Column("background_scale_m_per_px", sa.Float(), nullable=True),
        sa.Column("updated_by", sa.String(length=255), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["background_file_id"],
            ["stored_files.id"],
            name=op.f("fk_layouts_background_file_id_stored_files"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name=op.f("fk_layouts_project_id_projects"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_layouts")),
        sa.UniqueConstraint("project_id", name=op.f("uq_layouts_project_id")),
    )


def downgrade() -> None:
    op.drop_table("layouts")
    op.drop_index(op.f("ix_stored_files_project_id"), table_name="stored_files")
    op.drop_index(op.f("ix_stored_files_owner_id"), table_name="stored_files")
    op.drop_table("stored_files")
    # Postgres cannot drop an enum value: rebuild the type without it after removing the rows that use it.
    op.execute("DELETE FROM norms WHERE category = 'layout'")
    op.execute("ALTER TYPE norm_category RENAME TO norm_category_old")
    sa.Enum(*_NORM_CATEGORIES_BEFORE, name="norm_category").create(op.get_bind())
    op.execute(
        "ALTER TABLE norms ALTER COLUMN category TYPE norm_category USING category::text::norm_category"
    )
    op.execute("DROP TYPE norm_category_old")
