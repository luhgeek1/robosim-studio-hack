"""ORM entities. Kept deliberately small for the MVP (see PROJECT_CONTEXT.md §25)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Robot(Base):
    """Catalog entry (from catalog_export_v4.csv) plus curated numeric specs."""

    __tablename__ = "robots"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    short_name: Mapped[str] = mapped_column(String)
    vendor: Mapped[str] = mapped_column(String, default="")
    kind: Mapped[str] = mapped_column(String, default="")  # brs / bas / software
    status: Mapped[str] = mapped_column(String, default="")  # operation / piloting / rnd
    category: Mapped[str] = mapped_column(String, default="")  # Тип
    subtype: Mapped[str] = mapped_column(String, default="")  # Подтип
    scenario: Mapped[str] = mapped_column(String, default="")  # Сценарий
    cases: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    trl: Mapped[int | None] = mapped_column(Integer, nullable=True)
    market_potential: Mapped[float | None] = mapped_column(Float, nullable=True)
    region: Mapped[str] = mapped_column(String, default="")
    industry: Mapped[str] = mapped_column(String, default="")
    price_rub: Mapped[float | None] = mapped_column(Float, nullable=True)
    specs: Mapped[dict] = mapped_column(JSON, default=dict)  # RobotSpecification values with confidence


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    object_type: Mapped[str] = mapped_column(String, default="warehouse")
    address: Mapped[str] = mapped_column(String, default="")
    source_file: Mapped[str] = mapped_column(String, default="")
    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    version: Mapped[int] = mapped_column(Integer, default=0)  # bumps on every parameter change
    selected_robot_id: Mapped[str | None] = mapped_column(String, nullable=True)
    selected_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    import_report: Mapped[dict] = mapped_column(JSON, default=dict)

    parameters: Mapped[list[ProjectParameter]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectParameter(Base):
    """One normalized parameter with provenance (PROJECT_CONTEXT.md §7)."""

    __tablename__ = "project_parameters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    key: Mapped[str] = mapped_column(String)
    value: Mapped[object] = mapped_column(JSON, nullable=True)
    unit: Mapped[str] = mapped_column(String, default="")
    source: Mapped[str] = mapped_column(String, default="missing")  # confirmed | assumption | default | missing
    source_value: Mapped[str] = mapped_column(String, default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    note: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    project: Mapped[Project] = relationship(back_populates="parameters")


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    project_version: Mapped[int] = mapped_column(Integer)
    robot_id: Mapped[str] = mapped_column(String)
    robot_count: Mapped[int] = mapped_column(Integer)
    load_mode: Mapped[str] = mapped_column(String)
    kpis: Mapped[dict] = mapped_column(JSON, default=dict)
    events: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CalculationResult(Base):
    __tablename__ = "calculation_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    project_version: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String)  # matching | configurations | scenarios | recommendation
    key: Mapped[str] = mapped_column(String, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
