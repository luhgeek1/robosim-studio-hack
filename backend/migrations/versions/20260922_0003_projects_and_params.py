from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "765b1e4e2a8b"
down_revision: str | Sequence[str] | None = "1f5bd4077c1b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("object_type", sa.String(length=32), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "ready", "calculated", "archived", name="project_status"),
            nullable=False,
        ),
        sa.Column("init_mode", sa.Enum("blank", "demo", "copy", name="project_init_mode"), nullable=False),
        sa.Column("demo_key", sa.String(length=64), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("organization", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["object_type"], ["object_types.key"], name=op.f("fk_projects_object_type_object_types")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_projects_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_projects")),
    )
    op.create_index("ix_projects_owner_updated", "projects", ["owner_id", "updated_at"], unique=False)
    op.create_table(
        "audit_events",
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(length=255), nullable=False),
        sa.Column("entity", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("before", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_audit_events_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_events")),
    )
    op.create_index("ix_audit_events_project_at", "audit_events", ["project_id", "at"], unique=False)
    op.create_table(
        "param_history",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("old_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("new_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(name="provenance_status", create_type=False),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.String(length=255), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_param_history_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_param_history")),
    )
    op.create_index(
        "ix_param_history_project_key", "param_history", ["project_id", "key", "changed_at"], unique=False
    )
    op.create_table(
        "param_imports",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("source_kind", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=True),
        sa.Column("mapped", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("unmapped", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("applied", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_param_imports_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_param_imports")),
    )
    op.create_index(op.f("ix_param_imports_project_id"), "param_imports", ["project_id"], unique=False)
    op.create_table(
        "project_params",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(name="provenance_status", create_type=False),
            nullable=False,
        ),
        sa.Column("source_id", sa.UUID(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("raw_value", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("changed_by", sa.String(length=255), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_params_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"], ["sources.id"], name=op.f("fk_project_params_source_id_sources")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_project_params")),
        sa.UniqueConstraint("project_id", "key", name=op.f("uq_project_params_project_id")),
    )
    op.create_index(op.f("ix_project_params_project_id"), "project_params", ["project_id"], unique=False)
    op.add_column(
        "object_types",
        sa.Column("checks", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
    )
    op.add_column(
        "object_types",
        sa.Column(
            "demo_projects", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
    )
    op.add_column("process_defs", sa.Column("demand", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column(
        "process_defs",
        sa.Column(
            "labor_allocation", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
    )
    op.add_column("process_defs", sa.Column("labor_allocation_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("process_defs", "labor_allocation_note")
    op.drop_column("process_defs", "labor_allocation")
    op.drop_column("process_defs", "demand")
    op.drop_column("object_types", "demo_projects")
    op.drop_column("object_types", "checks")
    op.drop_index(op.f("ix_project_params_project_id"), table_name="project_params")
    op.drop_table("project_params")
    op.drop_index(op.f("ix_param_imports_project_id"), table_name="param_imports")
    op.drop_table("param_imports")
    op.drop_index("ix_param_history_project_key", table_name="param_history")
    op.drop_table("param_history")
    op.drop_index("ix_audit_events_project_at", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_projects_owner_updated", table_name="projects")
    op.drop_table("projects")
    for enum_name in ("project_init_mode", "project_status"):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
