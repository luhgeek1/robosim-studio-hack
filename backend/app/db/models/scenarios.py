import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UuidPkMixin, pg_enum, utcnow
from app.domain.scenario.models import CountMode, ScenarioKind

scenario_kind_enum = pg_enum(ScenarioKind, "scenario_kind")
count_mode_enum = pg_enum(CountMode, "count_mode")


class Scenario(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "scenarios"
    __table_args__ = (
        sa.Index("ix_scenarios_project_created", "project_id", "created_at"),
        sa.Index(
            "uq_scenarios_one_baseline", "project_id", unique=True, postgresql_where=sa.text("is_baseline")
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(sa.String(200))
    kind: Mapped[ScenarioKind] = mapped_column(scenario_kind_enum)
    is_baseline: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    financing: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    horizon_years: Mapped[int | None] = mapped_column(sa.Integer)
    discount_rate_pct: Mapped[float | None] = mapped_column(sa.Float)
    overrides: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    is_recommended: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    version: Mapped[int] = mapped_column(sa.Integer, default=1)
    created_by: Mapped[str] = mapped_column(sa.String(255))

    items: Mapped[list["ScenarioItem"]] = relationship(
        back_populates="scenario",
        cascade="all, delete-orphan",
        order_by="ScenarioItem.position",
        lazy="selectin",
    )


class ScenarioItem(UuidPkMixin, Base):
    __tablename__ = "scenario_items"
    __table_args__ = (sa.UniqueConstraint("scenario_id", "process_key"),)

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("scenarios.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(sa.Integer, default=0)
    process_key: Mapped[str] = mapped_column(sa.String(64))
    # A product used in a scenario cannot disappear silently: the catalog must archive it instead.
    product_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("products.id", ondelete="RESTRICT"))
    offer_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("product_offers.id", ondelete="SET NULL")
    )
    count_mode: Mapped[CountMode] = mapped_column(count_mode_enum, default=CountMode.AUTO)
    count_manual: Mapped[int | None] = mapped_column(sa.Integer)
    stations_mode: Mapped[CountMode] = mapped_column(count_mode_enum, default=CountMode.AUTO)
    stations_count: Mapped[int | None] = mapped_column(sa.Integer)
    price_override_rub: Mapped[float | None] = mapped_column(sa.Float)
    throughput_override_per_hour: Mapped[float | None] = mapped_column(sa.Float)
    override_reason: Mapped[str | None] = mapped_column(sa.Text)
    notes: Mapped[str | None] = mapped_column(sa.Text)

    scenario: Mapped[Scenario] = relationship(back_populates="items")


class CalculationRun(UuidPkMixin, Base):
    __tablename__ = "calculation_runs"
    __table_args__ = (sa.Index("ix_calculation_runs_scenario_computed", "scenario_id", "computed_at"),)

    scenario_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("scenarios.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    scenario_kind: Mapped[ScenarioKind] = mapped_column(scenario_kind_enum)
    project_version: Mapped[int] = mapped_column(sa.Integer)
    scenario_version: Mapped[int] = mapped_column(sa.Integer)
    catalog_version: Mapped[str] = mapped_column(sa.String(32))
    norm_set_version: Mapped[str] = mapped_column(sa.String(32))
    engine_version: Mapped[str] = mapped_column(sa.String(16))
    layout_version: Mapped[int | None] = mapped_column(sa.Integer)
    inputs_hash: Mapped[str] = mapped_column(sa.String(64))
    computed_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    duration_ms: Mapped[int] = mapped_column(sa.Integer)
    created_by: Mapped[str] = mapped_column(sa.String(255))
    capex_rub: Mapped[float] = mapped_column(sa.Float)
    effect_rub_year: Mapped[float] = mapped_column(sa.Float)
    npv_rub: Mapped[float] = mapped_column(sa.Float)
    payback_years: Mapped[float | None] = mapped_column(sa.Float)
    verdict: Mapped[str] = mapped_column(sa.String(32))
    result: Mapped[dict[str, Any]] = mapped_column(JSONB)
    trace: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    inputs: Mapped[dict[str, Any]] = mapped_column(JSONB)
