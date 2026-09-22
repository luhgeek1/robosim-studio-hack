import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UuidPkMixin, pg_enum
from app.domain.jobs import JobStatus


class SimulationRun(UuidPkMixin, CreatedAtMixin, Base):
    """One DES run: the resolved input is stored with it, so the run can be repeated and explained."""

    __tablename__ = "simulation_runs"
    __table_args__ = (sa.Index("ix_simulation_runs_scenario_created", "scenario_id", "created_at"),)

    scenario_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("scenarios.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("jobs.id", ondelete="SET NULL"))
    calculation_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("calculation_runs.id", ondelete="SET NULL")
    )
    status: Mapped[JobStatus] = mapped_column(pg_enum(JobStatus, "job_status"), default=JobStatus.QUEUED)
    progress: Mapped[float] = mapped_column(sa.Float, default=0.0)
    stage: Mapped[str | None] = mapped_column(sa.String(255))
    purpose: Mapped[str] = mapped_column(sa.String(16), default="run")
    config: Mapped[dict[str, Any]] = mapped_column(JSONB)
    engine_input: Mapped[dict[str, Any]] = mapped_column(JSONB)
    versions: Mapped[dict[str, Any]] = mapped_column(JSONB)
    layout_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("layouts.id", ondelete="CASCADE"))
    layout_version: Mapped[int] = mapped_column(sa.Integer)
    seed: Mapped[int] = mapped_column(sa.Integer)
    fleet: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    timeline: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    heatmap: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    robots: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    # gzip-compressed JSON list of events: a day of a warehouse is tens of thousands of events.
    events: Mapped[bytes | None] = mapped_column(sa.LargeBinary)
    events_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    duration_ms: Mapped[int | None] = mapped_column(sa.Integer)
    created_by: Mapped[str] = mapped_column(sa.String(255))
    finished_at: Mapped[datetime | None] = mapped_column(sa.DateTime(timezone=True))
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
