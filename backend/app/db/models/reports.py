import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UuidPkMixin, pg_enum
from app.domain.jobs import JobStatus


class Report(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "reports"
    __table_args__ = (sa.Index("ix_reports_project_created", "project_id", "created_at"),)

    project_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("projects.id", ondelete="CASCADE"))
    owner_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    job_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("jobs.id", ondelete="SET NULL"))
    format: Mapped[str] = mapped_column(sa.String(8))
    status: Mapped[JobStatus] = mapped_column(pg_enum(JobStatus, "job_status"), default=JobStatus.QUEUED)
    title: Mapped[str | None] = mapped_column(sa.String(255))
    sections: Mapped[list[str]] = mapped_column(JSONB, default=list)
    request: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    versions: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    disclaimer: Mapped[str] = mapped_column(sa.Text)
    file_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("stored_files.id", ondelete="SET NULL"))
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
