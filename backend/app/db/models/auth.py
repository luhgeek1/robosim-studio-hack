import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UuidPkMixin, pg_enum
from app.domain.auth import Role


class User(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    role: Mapped[Role] = mapped_column(pg_enum(Role, "user_role"), nullable=False, default=Role.USER)
    organization: Mapped[str | None] = mapped_column(sa.String(255))
    position: Mapped[str | None] = mapped_column(sa.String(255))
    vendor_manufacturer_id: Mapped[uuid.UUID | None] = mapped_column(sa.Uuid)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=True, server_default=sa.true()
    )
    auth_version: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=1, server_default="1")
    last_login_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))


class ApiKey(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "api_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    secret_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(sa.String(32)), nullable=False, default=list)
    last_used_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
