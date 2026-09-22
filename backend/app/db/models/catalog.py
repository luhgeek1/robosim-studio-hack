import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UuidPkMixin, pg_enum
from app.db.models.reference import provenance_enum
from app.domain.catalog import ProductStatus
from app.domain.common.provenance import ProvenanceStatus


class Manufacturer(UuidPkMixin, Base):
    __tablename__ = "manufacturers"

    name: Mapped[str] = mapped_column(sa.String(255), unique=True)
    country: Mapped[str] = mapped_column(sa.String(2), default="RU")
    region: Mapped[str | None] = mapped_column(sa.String(120))
    website: Mapped[str | None] = mapped_column(sa.Text)


class Product(UuidPkMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        sa.Index("ix_products_search", "search", postgresql_using="gin"),
        sa.Index("ix_products_object_types", "object_types", postgresql_using="gin"),
        sa.Index("ix_products_processes", "processes", postgresql_using="gin"),
    )

    name: Mapped[str] = mapped_column(sa.String(255), index=True)
    manufacturer_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("manufacturers.id"), index=True)
    solution_type: Mapped[str] = mapped_column(sa.ForeignKey("solution_types.key"), index=True)
    subtype: Mapped[str | None] = mapped_column(sa.String(255))
    catalog_category: Mapped[str | None] = mapped_column(sa.String(120))
    status: Mapped[ProductStatus] = mapped_column(pg_enum(ProductStatus, "product_status"))
    trl: Mapped[int | None] = mapped_column(sa.SmallInteger)
    market_potential: Mapped[float | None] = mapped_column(sa.Float)
    description: Mapped[str | None] = mapped_column(sa.Text)
    image_url: Mapped[str | None] = mapped_column(sa.Text)
    object_types: Mapped[list[str]] = mapped_column(ARRAY(sa.String(32)), default=list)
    processes: Mapped[list[str]] = mapped_column(ARRAY(sa.String(64)), default=list)
    badges: Mapped[list[str]] = mapped_column(ARRAY(sa.String(32)), default=list)
    completeness: Mapped[float] = mapped_column(sa.Float, default=0.0)
    price_from_rub: Mapped[float] = mapped_column(sa.Numeric(14, 2, asdecimal=False), default=0.0)
    offers_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    # False once an admin edits the card: seeds then stop overwriting it.
    managed_by_seed: Mapped[bool] = mapped_column(sa.Boolean, default=True, server_default=sa.true())
    search: Mapped[Any] = mapped_column(
        TSVECTOR,
        sa.Computed(
            "setweight(to_tsvector('russian', coalesce(name, '')), 'A') || "
            "setweight(to_tsvector('russian', coalesce(subtype, '')), 'B') || "
            "setweight(to_tsvector('russian', coalesce(description, '')), 'C')",
            persisted=True,
        ),
    )


class ProductOffer(UuidPkMixin, Base):
    __tablename__ = "product_offers"

    product_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    industry_key: Mapped[str] = mapped_column(sa.ForeignKey("industries.key"), index=True)
    scenario: Mapped[str] = mapped_column(sa.Text)
    price_rub: Mapped[float] = mapped_column(sa.Numeric(14, 2, asdecimal=False))
    vat_included: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    cases_text: Mapped[str | None] = mapped_column(sa.Text)
    source_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("sources.id"))
    source_row: Mapped[int | None] = mapped_column(sa.Integer)


class ProductSpec(UuidPkMixin, Base):
    __tablename__ = "product_specs"
    __table_args__ = (sa.UniqueConstraint("product_id", "key", "source_id"),)

    product_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(sa.ForeignKey("spec_keys.key"), index=True)
    value: Mapped[Any] = mapped_column(JSONB)
    value_num: Mapped[float | None] = mapped_column(sa.Float)
    unit: Mapped[str | None] = mapped_column(sa.String(64))
    status: Mapped[ProvenanceStatus] = mapped_column(provenance_enum)
    source_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("sources.id"))
    is_primary: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    raw_value: Mapped[str | None] = mapped_column(sa.Text)
    note: Mapped[str | None] = mapped_column(sa.Text)
    confidence: Mapped[float | None] = mapped_column(sa.Float)


class ProductCase(UuidPkMixin, Base):
    __tablename__ = "product_cases"

    product_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    customer: Mapped[str] = mapped_column(sa.String(255))
    count: Mapped[int | None] = mapped_column(sa.Integer)
    description: Mapped[str | None] = mapped_column(sa.Text)
    year: Mapped[int | None] = mapped_column(sa.SmallInteger)
    source_id: Mapped[uuid.UUID | None] = mapped_column(sa.ForeignKey("sources.id"))
