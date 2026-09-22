import uuid
from datetime import date, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UuidPkMixin, pg_enum, utcnow
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.domain.reference import NormCategory, SizingModel, SpecGroup

provenance_enum = pg_enum(ProvenanceStatus, "provenance_status")
sizing_enum = pg_enum(SizingModel, "sizing_model")


class Source(UuidPkMixin, CreatedAtMixin, Base):
    __tablename__ = "sources"

    key: Mapped[str | None] = mapped_column(sa.String(255), unique=True)
    kind: Mapped[SourceKind] = mapped_column(pg_enum(SourceKind, "source_kind"))
    title: Mapped[str] = mapped_column(sa.Text)
    url: Mapped[str | None] = mapped_column(sa.Text)
    retrieved_at: Mapped[date | None] = mapped_column(sa.Date)
    note: Mapped[str | None] = mapped_column(sa.Text)


class ObjectType(Base):
    __tablename__ = "object_types"

    key: Mapped[str] = mapped_column(sa.String(32), primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(120))
    description: Mapped[str | None] = mapped_column(sa.Text)
    industry: Mapped[str] = mapped_column(sa.String(120))
    depth: Mapped[str] = mapped_column(sa.String(16))
    dataset_sheet: Mapped[str | None] = mapped_column(sa.String(64))
    parameter_groups: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    labor_groups: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    layout_templates: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    order: Mapped[int] = mapped_column(sa.Integer, default=0)


class ParameterDef(UuidPkMixin, Base):
    __tablename__ = "parameter_defs"
    __table_args__ = (sa.UniqueConstraint("object_type", "key"),)

    object_type: Mapped[str] = mapped_column(
        sa.ForeignKey("object_types.key", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(sa.String(64))
    group_key: Mapped[str] = mapped_column(sa.String(64))
    name: Mapped[str] = mapped_column(sa.String(255))
    type: Mapped[str] = mapped_column(sa.String(16))
    unit: Mapped[str | None] = mapped_column(sa.String(64))
    required: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    min_value: Mapped[float | None] = mapped_column(sa.Float)
    max_value: Mapped[float | None] = mapped_column(sa.Float)
    step: Mapped[float | None] = mapped_column(sa.Float)
    enum_values: Mapped[list[dict[str, str]]] = mapped_column(JSONB, default=list)
    default_value: Mapped[Any] = mapped_column(JSONB)
    default_status: Mapped[ProvenanceStatus | None] = mapped_column(provenance_enum)
    default_source_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("sources.id"))
    default_note: Mapped[str | None] = mapped_column(sa.Text)
    dataset_row: Mapped[str | None] = mapped_column(sa.Text)
    hint: Mapped[str | None] = mapped_column(sa.Text)
    example: Mapped[str | None] = mapped_column(sa.String(255))
    affects: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    order: Mapped[int] = mapped_column(sa.Integer, default=0)


class ProcessDef(UuidPkMixin, Base):
    __tablename__ = "process_defs"
    __table_args__ = (sa.UniqueConstraint("object_type", "key"),)

    object_type: Mapped[str] = mapped_column(
        sa.ForeignKey("object_types.key", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(sa.String(64))
    name: Mapped[str] = mapped_column(sa.String(255))
    description: Mapped[str | None] = mapped_column(sa.Text)
    demand_unit: Mapped[str] = mapped_column(sa.String(32))
    demand_formula: Mapped[str | None] = mapped_column(sa.Text)
    demand_params: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    sla: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    labor_groups: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    solution_types: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    sizing_model: Mapped[SizingModel | None] = mapped_column(sizing_enum)
    order: Mapped[int] = mapped_column(sa.Integer, default=0)


class SolutionType(Base):
    __tablename__ = "solution_types"

    key: Mapped[str] = mapped_column(sa.String(64), primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(255))
    description: Mapped[str | None] = mapped_column(sa.Text)
    sizing_model: Mapped[SizingModel | None] = mapped_column(sizing_enum)
    capability_keys: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    in_scope: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    order: Mapped[int] = mapped_column(sa.Integer, default=0)


class SpecKey(Base):
    __tablename__ = "spec_keys"

    key: Mapped[str] = mapped_column(sa.String(64), primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(255))
    group: Mapped[SpecGroup] = mapped_column(pg_enum(SpecGroup, "spec_group"))
    unit: Mapped[str | None] = mapped_column(sa.String(64))
    value_type: Mapped[str] = mapped_column(sa.String(16))
    better: Mapped[str] = mapped_column(sa.String(8), default="none")
    is_key_constraint: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    solution_types: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    order: Mapped[int] = mapped_column(sa.Integer, default=0)


class Industry(Base):
    __tablename__ = "industries"

    key: Mapped[str] = mapped_column(sa.String(64), primary_key=True)
    name: Mapped[str] = mapped_column(sa.String(255), unique=True)


class NormSet(UuidPkMixin, Base):
    __tablename__ = "norm_sets"

    version: Mapped[str] = mapped_column(sa.String(32), unique=True)
    published_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    published_by: Mapped[str | None] = mapped_column(sa.String(255))
    notes: Mapped[str | None] = mapped_column(sa.Text)
    is_current: Mapped[bool] = mapped_column(sa.Boolean, default=False)


class Norm(UuidPkMixin, Base):
    __tablename__ = "norms"
    __table_args__ = (sa.UniqueConstraint("norm_set_id", "key"),)

    norm_set_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("norm_sets.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(sa.String(64))
    name: Mapped[str] = mapped_column(sa.String(255))
    value: Mapped[float] = mapped_column(sa.Float)
    unit: Mapped[str] = mapped_column(sa.String(64))
    category: Mapped[NormCategory] = mapped_column(pg_enum(NormCategory, "norm_category"))
    range_min: Mapped[float | None] = mapped_column(sa.Float)
    range_max: Mapped[float | None] = mapped_column(sa.Float)
    source_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("sources.id"))
    rationale: Mapped[str | None] = mapped_column(sa.Text)
    affects: Mapped[list[str]] = mapped_column(ARRAY(sa.String(32)), default=list)
    editable_by_user: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    object_types: Mapped[list[str]] = mapped_column(ARRAY(sa.String(32)), default=list)


class DataVersion(Base):
    __tablename__ = "data_versions"

    key: Mapped[str] = mapped_column(sa.String(32), primary_key=True)
    version: Mapped[str] = mapped_column(sa.String(32))
    content_hash: Mapped[str | None] = mapped_column(sa.String(64))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)
