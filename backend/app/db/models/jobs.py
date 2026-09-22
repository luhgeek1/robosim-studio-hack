import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UuidPkMixin, pg_enum
from app.domain.jobs import JobStatus, JobType


class Job(UuidPkMixin, CreatedAtMixin, Base):
    """Background task. Postgres is the source of truth for status; Redis carries the queue and progress."""

    __tablename__ = "jobs"
    __table_args__ = (sa.Index("ix_jobs_status_created", "status", "created_at"),)

    type: Mapped[JobType] = mapped_column(pg_enum(JobType, "job_type"))
    status: Mapped[JobStatus] = mapped_column(pg_enum(JobStatus, "job_status"), default=JobStatus.QUEUED)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    progress: Mapped[float] = mapped_column(sa.Float, nullable=False, default=0.0)
    stage: Mapped[str | None] = mapped_column(sa.String(255))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    result_url: Mapped[str | None] = mapped_column(sa.String(512))
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    attempts: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=3)
    started_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
