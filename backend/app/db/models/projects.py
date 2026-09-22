import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UuidPkMixin, pg_enum, utcnow
from app.db.models.reference import provenance_enum
from app.domain.common.provenance import ProvenanceStatus
from app.domain.project.models import InitMode, ProjectStatus


def _project_fk() -> sa.ForeignKey:
    return sa.ForeignKey("projects.id", ondelete="CASCADE")


class Project(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (sa.Index("ix_projects_owner_updated", "owner_id", "updated_at"),)

    owner_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(sa.String(200))
    object_type: Mapped[str] = mapped_column(sa.ForeignKey("object_types.key"))
    status: Mapped[ProjectStatus] = mapped_column(
        pg_enum(ProjectStatus, "project_status"), default=ProjectStatus.DRAFT
    )
    init_mode: Mapped[InitMode] = mapped_column(
        pg_enum(InitMode, "project_init_mode"), default=InitMode.BLANK
    )
    demo_key: Mapped[str | None] = mapped_column(sa.String(64))
    version: Mapped[int] = mapped_column(sa.Integer, default=1)
    organization: Mapped[str | None] = mapped_column(sa.String(255))
    notes: Mapped[str | None] = mapped_column(sa.Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)


class ProjectParam(UuidPkMixin, Base):
    __tablename__ = "project_params"
    __table_args__ = (sa.UniqueConstraint("project_id", "key"),)

    project_id: Mapped[uuid.UUID] = mapped_column(_project_fk(), index=True)
    key: Mapped[str] = mapped_column(sa.String(64))
    value: Mapped[Any] = mapped_column(JSONB)
    unit: Mapped[str | None] = mapped_column(sa.String(64))
    status: Mapped[ProvenanceStatus] = mapped_column(provenance_enum)
    source_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("sources.id"))
    confidence: Mapped[float | None] = mapped_column(sa.Float)
    raw_value: Mapped[str | None] = mapped_column(sa.Text)
    note: Mapped[str | None] = mapped_column(sa.Text)
    changed_by: Mapped[str] = mapped_column(sa.String(255))
    changed_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)


class ParamHistory(UuidPkMixin, Base):
    __tablename__ = "param_history"
    __table_args__ = (sa.Index("ix_param_history_project_key", "project_id", "key", "changed_at"),)

    project_id: Mapped[uuid.UUID] = mapped_column(_project_fk())
    key: Mapped[str] = mapped_column(sa.String(64))
    old_value: Mapped[Any] = mapped_column(JSONB)
    new_value: Mapped[Any] = mapped_column(JSONB)
    status: Mapped[ProvenanceStatus] = mapped_column(provenance_enum)
    note: Mapped[str | None] = mapped_column(sa.Text)
    changed_by: Mapped[str] = mapped_column(sa.String(255))
    changed_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)


class AuditEvent(UuidPkMixin, Base):
    __tablename__ = "audit_events"
    __table_args__ = (sa.Index("ix_audit_events_project_at", "project_id", "at"),)

    project_id: Mapped[uuid.UUID | None] = mapped_column(_project_fk())
    at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    actor: Mapped[str] = mapped_column(sa.String(255))
    entity: Mapped[str] = mapped_column(sa.String(255))
    action: Mapped[str] = mapped_column(sa.String(32))
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    note: Mapped[str | None] = mapped_column(sa.Text)


class ParamImport(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "param_imports"

    project_id: Mapped[uuid.UUID] = mapped_column(_project_fk(), index=True)
    source_kind: Mapped[str] = mapped_column(sa.String(32))
    provider: Mapped[str] = mapped_column(sa.String(32))
    filename: Mapped[str | None] = mapped_column(sa.String(255))
    mapped: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    unmapped: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    warnings: Mapped[list[str]] = mapped_column(JSONB, default=list)
    applied: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    created_by: Mapped[str] = mapped_column(sa.String(255))
