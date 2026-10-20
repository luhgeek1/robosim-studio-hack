from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UuidPkMixin


class UserCredential(TimestampMixin, Base):
    __tablename__ = "user_credentials"

    user_id: Mapped[UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    password_hash: Mapped[str] = mapped_column(sa.String(255))


class OAuthIdentity(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "oauth_identities"
    __table_args__ = (sa.UniqueConstraint("provider", "subject"), sa.UniqueConstraint("user_id", "provider"))

    user_id: Mapped[UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(sa.String(16))
    subject: Mapped[str] = mapped_column(sa.String(255))


class AuthSession(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_jti_hash: Mapped[str] = mapped_column(sa.String(64))
    client: Mapped[str] = mapped_column(sa.String(16))
    method: Mapped[str] = mapped_column(sa.String(16))
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class AuthEmailToken(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "auth_email_tokens"

    user_id: Mapped[UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(sa.String(32))
    token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
