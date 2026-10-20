from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "792d530cc51b"
down_revision: str | Sequence[str] | None = "3dbb3bf39499"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_email_tokens",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_auth_email_tokens_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_email_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_auth_email_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_auth_email_tokens_expires_at"), "auth_email_tokens", ["expires_at"], unique=False
    )
    op.create_index(op.f("ix_auth_email_tokens_user_id"), "auth_email_tokens", ["user_id"], unique=False)
    op.create_table(
        "auth_sessions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("refresh_jti_hash", sa.String(length=64), nullable=False),
        sa.Column("client", sa.String(length=16), nullable=False),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_auth_sessions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_sessions")),
    )
    op.create_index(op.f("ix_auth_sessions_expires_at"), "auth_sessions", ["expires_at"], unique=False)
    op.create_index(op.f("ix_auth_sessions_user_id"), "auth_sessions", ["user_id"], unique=False)
    op.create_table(
        "oauth_identities",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_oauth_identities_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_oauth_identities")),
        sa.UniqueConstraint("provider", "subject", name=op.f("uq_oauth_identities_provider")),
        sa.UniqueConstraint("user_id", "provider", name=op.f("uq_oauth_identities_user_id")),
    )
    op.create_index(op.f("ix_oauth_identities_user_id"), "oauth_identities", ["user_id"], unique=False)
    op.create_table(
        "user_credentials",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_credentials_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_credentials")),
    )
    op.add_column("email_outbox", sa.Column("auth_email_token_id", sa.UUID(), nullable=True))
    op.alter_column("email_outbox", "invitation_id", existing_type=sa.UUID(), nullable=True)
    op.create_unique_constraint(
        op.f("uq_email_outbox_auth_email_token_id"), "email_outbox", ["auth_email_token_id"]
    )
    op.create_foreign_key(
        op.f("fk_email_outbox_auth_email_token_id_auth_email_tokens"),
        "email_outbox",
        "auth_email_tokens",
        ["auth_email_token_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "INSERT INTO user_credentials (user_id, password_hash) SELECT id, password_hash FROM users WHERE password_hash NOT LIKE '!%'"
    )
    op.execute(
        "UPDATE users SET email_verified_at = now() WHERE email IN ('admin@robomera.demo', 'user@robomera.demo', 'vendor@robomera.demo')"
    )
    op.create_check_constraint(
        "ck_email_outbox_one_reference",
        "email_outbox",
        "num_nonnulls(invitation_id, auth_email_token_id) = 1",
    )
    op.drop_column("users", "password_hash")


def downgrade() -> None:
    op.add_column(
        "users", sa.Column("password_hash", sa.VARCHAR(length=255), autoincrement=False, nullable=True)
    )
    op.execute(
        "UPDATE users SET password_hash = coalesce((SELECT password_hash FROM user_credentials WHERE user_id = users.id), '!disabled')"
    )
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
    op.drop_column("users", "email_verified_at")
    op.drop_constraint("ck_email_outbox_one_reference", "email_outbox", type_="check")
    op.execute("DELETE FROM email_outbox WHERE invitation_id IS NULL")
    op.drop_constraint(
        op.f("fk_email_outbox_auth_email_token_id_auth_email_tokens"), "email_outbox", type_="foreignkey"
    )
    op.drop_constraint(op.f("uq_email_outbox_auth_email_token_id"), "email_outbox", type_="unique")
    op.alter_column("email_outbox", "invitation_id", existing_type=sa.UUID(), nullable=False)
    op.drop_column("email_outbox", "auth_email_token_id")
    op.drop_table("user_credentials")
    op.drop_index(op.f("ix_oauth_identities_user_id"), table_name="oauth_identities")
    op.drop_table("oauth_identities")
    op.drop_index(op.f("ix_auth_sessions_user_id"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_expires_at"), table_name="auth_sessions")
    op.drop_table("auth_sessions")
    op.drop_index(op.f("ix_auth_email_tokens_user_id"), table_name="auth_email_tokens")
    op.drop_index(op.f("ix_auth_email_tokens_expires_at"), table_name="auth_email_tokens")
    op.drop_table("auth_email_tokens")
