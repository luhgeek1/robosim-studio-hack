import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UuidPkMixin


class StoredFile(UuidPkMixin, CreatedAtMixin, Base):
    """Small user files kept in Postgres so `docker compose up` needs no object storage."""

    __tablename__ = "stored_files"

    owner_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    purpose: Mapped[str] = mapped_column(sa.String(32))
    filename: Mapped[str] = mapped_column(sa.String(255))
    content_type: Mapped[str] = mapped_column(sa.String(128))
    size_bytes: Mapped[int] = mapped_column(sa.Integer)
    data: Mapped[bytes] = mapped_column(sa.LargeBinary)


class Layout(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "layouts"

    project_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="CASCADE"), unique=True
    )
    version: Mapped[int] = mapped_column(sa.Integer, default=1)
    template: Mapped[str | None] = mapped_column(sa.String(64))
    width_m: Mapped[float] = mapped_column(sa.Float)
    height_m: Mapped[float] = mapped_column(sa.Float)
    zones: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    racks: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    nodes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    edges: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    generated: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    generator: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    derivation: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    warnings: Mapped[list[str]] = mapped_column(JSONB, default=list)
    background_file_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("stored_files.id", ondelete="SET NULL")
    )
    background_scale_m_per_px: Mapped[float | None] = mapped_column(sa.Float)
    updated_by: Mapped[str] = mapped_column(sa.String(255))
