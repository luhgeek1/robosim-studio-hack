from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "1f5bd4077c1b"
down_revision: str | Sequence[str] | None = "3127dd397c39"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "data_versions",
        sa.Column("key", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_data_versions")),
    )
    op.create_table(
        "industries",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_industries")),
        sa.UniqueConstraint("name", name=op.f("uq_industries_name")),
    )
    op.create_table(
        "manufacturers",
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=True),
        sa.Column("website", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_manufacturers")),
        sa.UniqueConstraint("name", name=op.f("uq_manufacturers_name")),
    )
    op.create_table(
        "norm_sets",
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_by", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_norm_sets")),
        sa.UniqueConstraint("version", name=op.f("uq_norm_sets_version")),
    )
    op.create_table(
        "object_types",
        sa.Column("key", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(length=120), nullable=False),
        sa.Column("depth", sa.String(length=16), nullable=False),
        sa.Column("dataset_sheet", sa.String(length=64), nullable=True),
        sa.Column("parameter_groups", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("labor_groups", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("layout_templates", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_object_types")),
    )
    op.create_table(
        "solution_types",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "sizing_model",
            sa.Enum(
                "transport_cycle",
                "goods_to_person",
                "area_coverage",
                "station_throughput",
                "tow_train",
                "elevator_cycle",
                name="sizing_model",
            ),
            nullable=True,
        ),
        sa.Column("capability_keys", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("in_scope", sa.Boolean(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_solution_types")),
    )
    op.create_table(
        "sources",
        sa.Column("key", sa.String(length=255), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "organizer_dataset",
                "organizer_catalog",
                "fcbas_scenario",
                "vendor_site",
                "open_source",
                "regulation",
                "team_assumption",
                "user_input",
                "llm_extracted",
                "simulation",
                name="source_kind",
            ),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sources")),
        sa.UniqueConstraint("key", name=op.f("uq_sources_key")),
    )
    op.create_table(
        "spec_keys",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "group",
            sa.Enum(
                "identification",
                "technical",
                "infrastructure",
                "economics",
                "applicability",
                "data_quality",
                name="spec_group",
            ),
            nullable=False,
        ),
        sa.Column("unit", sa.String(length=64), nullable=True),
        sa.Column("value_type", sa.String(length=16), nullable=False),
        sa.Column("better", sa.String(length=8), nullable=False),
        sa.Column("is_key_constraint", sa.Boolean(), nullable=False),
        sa.Column("solution_types", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_spec_keys")),
    )
    op.create_table(
        "norms",
        sa.Column("norm_set_id", sa.UUID(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "capex",
                "opex",
                "labor",
                "finance",
                "operations",
                "simulation",
                "sizing",
                "risk",
                name="norm_category",
            ),
            nullable=False,
        ),
        sa.Column("range_min", sa.Float(), nullable=True),
        sa.Column("range_max", sa.Float(), nullable=True),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("affects", postgresql.ARRAY(sa.String(length=32)), nullable=False),
        sa.Column("editable_by_user", sa.Boolean(), nullable=False),
        sa.Column("object_types", postgresql.ARRAY(sa.String(length=32)), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["norm_set_id"], ["norm_sets.id"], name=op.f("fk_norms_norm_set_id_norm_sets"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"], name=op.f("fk_norms_source_id_sources")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_norms")),
        sa.UniqueConstraint("norm_set_id", "key", name=op.f("uq_norms_norm_set_id")),
    )
    op.create_index(op.f("ix_norms_norm_set_id"), "norms", ["norm_set_id"], unique=False)
    op.create_table(
        "parameter_defs",
        sa.Column("object_type", sa.String(length=32), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("group_key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=True),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("min_value", sa.Float(), nullable=True),
        sa.Column("max_value", sa.Float(), nullable=True),
        sa.Column("step", sa.Float(), nullable=True),
        sa.Column("enum_values", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("default_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "default_status",
            sa.Enum(
                "user",
                "imported",
                "llm_suggested",
                "default",
                "assumption",
                "derived",
                "confirmed",
                "vendor_claim",
                "missing",
                name="provenance_status",
            ),
            nullable=True,
        ),
        sa.Column("default_source_id", sa.UUID(), nullable=True),
        sa.Column("default_note", sa.Text(), nullable=True),
        sa.Column("dataset_row", sa.Text(), nullable=True),
        sa.Column("hint", sa.Text(), nullable=True),
        sa.Column("example", sa.String(length=255), nullable=True),
        sa.Column("affects", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["default_source_id"], ["sources.id"], name=op.f("fk_parameter_defs_default_source_id_sources")
        ),
        sa.ForeignKeyConstraint(
            ["object_type"],
            ["object_types.key"],
            name=op.f("fk_parameter_defs_object_type_object_types"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_parameter_defs")),
        sa.UniqueConstraint("object_type", "key", name=op.f("uq_parameter_defs_object_type")),
    )
    op.create_index(op.f("ix_parameter_defs_object_type"), "parameter_defs", ["object_type"], unique=False)
    op.create_table(
        "process_defs",
        sa.Column("object_type", sa.String(length=32), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("demand_unit", sa.String(length=32), nullable=False),
        sa.Column("demand_formula", sa.Text(), nullable=True),
        sa.Column("demand_params", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("sla", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("labor_groups", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("solution_types", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column(
            "sizing_model",
            sa.Enum(
                "transport_cycle",
                "goods_to_person",
                "area_coverage",
                "station_throughput",
                "tow_train",
                "elevator_cycle",
                name="sizing_model",
            ),
            nullable=True,
        ),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["object_type"],
            ["object_types.key"],
            name=op.f("fk_process_defs_object_type_object_types"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_process_defs")),
        sa.UniqueConstraint("object_type", "key", name=op.f("uq_process_defs_object_type")),
    )
    op.create_index(op.f("ix_process_defs_object_type"), "process_defs", ["object_type"], unique=False)
    op.create_table(
        "products",
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("manufacturer_id", sa.UUID(), nullable=False),
        sa.Column("solution_type", sa.String(length=64), nullable=False),
        sa.Column("subtype", sa.String(length=255), nullable=True),
        sa.Column("catalog_category", sa.String(length=120), nullable=True),
        sa.Column("status", sa.Enum("operation", "piloting", "rnd", name="product_status"), nullable=False),
        sa.Column("trl", sa.SmallInteger(), nullable=True),
        sa.Column("market_potential", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("object_types", postgresql.ARRAY(sa.String(length=32)), nullable=False),
        sa.Column("processes", postgresql.ARRAY(sa.String(length=64)), nullable=False),
        sa.Column("badges", postgresql.ARRAY(sa.String(length=32)), nullable=False),
        sa.Column("completeness", sa.Float(), nullable=False),
        sa.Column("price_from_rub", sa.Numeric(precision=14, scale=2, asdecimal=False), nullable=False),
        sa.Column("offers_count", sa.Integer(), nullable=False),
        sa.Column("managed_by_seed", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('russian', coalesce(name, '')), 'A') || setweight(to_tsvector('russian', coalesce(subtype, '')), 'B') || setweight(to_tsvector('russian', coalesce(description, '')), 'C')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["manufacturer_id"], ["manufacturers.id"], name=op.f("fk_products_manufacturer_id_manufacturers")
        ),
        sa.ForeignKeyConstraint(
            ["solution_type"], ["solution_types.key"], name=op.f("fk_products_solution_type_solution_types")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_products")),
    )
    op.create_index(op.f("ix_products_manufacturer_id"), "products", ["manufacturer_id"], unique=False)
    op.create_index(op.f("ix_products_name"), "products", ["name"], unique=False)
    op.create_index(
        "ix_products_object_types", "products", ["object_types"], unique=False, postgresql_using="gin"
    )
    op.create_index("ix_products_processes", "products", ["processes"], unique=False, postgresql_using="gin")
    op.create_index("ix_products_search", "products", ["search"], unique=False, postgresql_using="gin")
    op.create_index(op.f("ix_products_solution_type"), "products", ["solution_type"], unique=False)
    op.create_table(
        "product_cases",
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("customer", sa.String(length=255), nullable=False),
        sa.Column("count", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("source_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_cases_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"], ["sources.id"], name=op.f("fk_product_cases_source_id_sources")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_cases")),
    )
    op.create_index(op.f("ix_product_cases_product_id"), "product_cases", ["product_id"], unique=False)
    op.create_table(
        "product_offers",
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("industry_key", sa.String(length=64), nullable=False),
        sa.Column("scenario", sa.Text(), nullable=False),
        sa.Column("price_rub", sa.Numeric(precision=14, scale=2, asdecimal=False), nullable=False),
        sa.Column("vat_included", sa.Boolean(), nullable=False),
        sa.Column("cases_text", sa.Text(), nullable=True),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("source_row", sa.Integer(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["industry_key"], ["industries.key"], name=op.f("fk_product_offers_industry_key_industries")
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_offers_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"], ["sources.id"], name=op.f("fk_product_offers_source_id_sources")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_offers")),
    )
    op.create_index(op.f("ix_product_offers_industry_key"), "product_offers", ["industry_key"], unique=False)
    op.create_index(op.f("ix_product_offers_product_id"), "product_offers", ["product_id"], unique=False)
    op.create_table(
        "product_specs",
        sa.Column("product_id", sa.UUID(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("value_num", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "user",
                "imported",
                "llm_suggested",
                "default",
                "assumption",
                "derived",
                "confirmed",
                "vendor_claim",
                "missing",
                name="provenance_status",
            ),
            nullable=False,
        ),
        sa.Column("source_id", sa.UUID(), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["key"], ["spec_keys.key"], name=op.f("fk_product_specs_key_spec_keys")),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_specs_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_id"], ["sources.id"], name=op.f("fk_product_specs_source_id_sources")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_specs")),
        sa.UniqueConstraint("product_id", "key", "source_id", name=op.f("uq_product_specs_product_id")),
    )
    op.create_index(op.f("ix_product_specs_key"), "product_specs", ["key"], unique=False)
    op.create_index(op.f("ix_product_specs_product_id"), "product_specs", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_product_specs_product_id"), table_name="product_specs")
    op.drop_index(op.f("ix_product_specs_key"), table_name="product_specs")
    op.drop_table("product_specs")
    op.drop_index(op.f("ix_product_offers_product_id"), table_name="product_offers")
    op.drop_index(op.f("ix_product_offers_industry_key"), table_name="product_offers")
    op.drop_table("product_offers")
    op.drop_index(op.f("ix_product_cases_product_id"), table_name="product_cases")
    op.drop_table("product_cases")
    op.drop_index(op.f("ix_products_solution_type"), table_name="products")
    op.drop_index("ix_products_search", table_name="products", postgresql_using="gin")
    op.drop_index("ix_products_processes", table_name="products", postgresql_using="gin")
    op.drop_index("ix_products_object_types", table_name="products", postgresql_using="gin")
    op.drop_index(op.f("ix_products_name"), table_name="products")
    op.drop_index(op.f("ix_products_manufacturer_id"), table_name="products")
    op.drop_table("products")
    op.drop_index(op.f("ix_process_defs_object_type"), table_name="process_defs")
    op.drop_table("process_defs")
    op.drop_index(op.f("ix_parameter_defs_object_type"), table_name="parameter_defs")
    op.drop_table("parameter_defs")
    op.drop_index(op.f("ix_norms_norm_set_id"), table_name="norms")
    op.drop_table("norms")
    op.drop_table("spec_keys")
    op.drop_table("sources")
    op.drop_table("solution_types")
    op.drop_table("object_types")
    op.drop_table("norm_sets")
    op.drop_table("manufacturers")
    op.drop_table("industries")
    op.drop_table("data_versions")
    for enum_name in (
        "product_status",
        "norm_category",
        "spec_group",
        "sizing_model",
        "source_kind",
        "provenance_status",
    ):
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
