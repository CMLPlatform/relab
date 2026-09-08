"""Initial schema.

Flattened on 2026-09-08 from the previous 49-revision chain, whose head was this
revision id; prod and staging already record it, so no host needs a stamp.

* ``unaccent`` is installed in the ``extensions`` schema, which ``just restore``
  leaves alone when it drops and recreates ``public``; ``pg_trgm`` stays in
  ``public`` where the old chain put it.
* ``relab_unaccent(text)`` is an IMMUTABLE wrapper (``unaccent`` is only STABLE,
  so it cannot appear in an index or generated column). String body on purpose:
  pg_dump restores functions with check_function_bodies off, so a restore does
  not need the extension before pre-data.
* The ``relab`` text search configuration is ``english`` with ``unaccent`` in
  front of the stemmer; the four generated ``search_vector`` columns use it.
* Requires PostgreSQL 18: the ``RENAME CONSTRAINT`` on ``user`` relies on PG18
  cataloguing NOT NULL constraints by name.

Only ever runs on an empty database, so plain DDL throughout.

Revision ID: a9c2e4f60b18
Revises:
Create Date: 2026-09-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# NOTE: `file.file` / `image.file` are FileType/ImageType and the token columns are
# EncryptedString in the ORM, but those are TypeDecorators over Unicode/String and
# render as plain VARCHAR. Spelled out here rather than imported: importing app code
# loads Settings, which needs ENVIRONMENT and secrets the migrator does not always have.

revision: str = "a9c2e4f60b18"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
ROLLBACK_SAFE = True  # downgrade drops everything this file creates; nothing to lose


def _create_search_infrastructure() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE SCHEMA IF NOT EXISTS extensions")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions")
    op.execute(
        "CREATE OR REPLACE FUNCTION public.relab_unaccent(text) RETURNS text "
        "LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT "
        "AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$"
    )
    op.execute("CREATE TEXT SEARCH CONFIGURATION public.relab (COPY = pg_catalog.english)")
    op.execute(
        "ALTER TEXT SEARCH CONFIGURATION public.relab "
        "ALTER MAPPING FOR hword, hword_part, word WITH extensions.unaccent, english_stem"
    )


def upgrade() -> None:  # noqa: PLR0915
    op.execute("SET LOCAL lock_timeout = '3s'")
    _create_search_infrastructure()
    sa.Enum("ACTIVE", "REVOKED", name="cameracredentialstatus").create(op.get_bind())
    sa.Enum("KILOGRAM", "GRAM", "METER", "CENTIMETER", name="unit").create(op.get_bind())
    sa.Enum("MATERIALS", "PRODUCTS", "OTHER", name="taxonomydomain").create(op.get_bind())
    sa.Enum("PRODUCT", "PRODUCT_TYPE", "MATERIAL", name="imageparenttype").create(op.get_bind())
    sa.Enum("PRODUCT", "PRODUCT_TYPE", "MATERIAL", name="fileparenttype").create(op.get_bind())
    op.create_table(
        "file",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("file", sa.Unicode(), nullable=False),
        sa.Column(
            "parent_type",
            postgresql.ENUM("PRODUCT", "PRODUCT_TYPE", "MATERIAL", name="fileparenttype", create_type=False),
            nullable=False,
        ),
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.Column("upload_size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("upload_size_bytes >= 0", name="ck_file_upload_size_bytes_non_negative"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_file_parent_type_parent_id", "file", ["parent_type", "parent_id"], unique=False)
    op.create_table(
        "image",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("image_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("file", sa.Unicode(), nullable=False),
        sa.Column(
            "parent_type",
            postgresql.ENUM("PRODUCT", "PRODUCT_TYPE", "MATERIAL", name="imageparenttype", create_type=False),
            nullable=False,
        ),
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.Column("upload_size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "(width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)",
            name="ck_image_dimensions_positive",
        ),
        sa.CheckConstraint("upload_size_bytes >= 0", name="ck_image_upload_size_bytes_non_negative"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "image_description_trgm_idx",
        "image",
        ["description"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"description": "gin_trgm_ops"},
    )
    op.create_index(
        "image_filename_trgm_idx",
        "image",
        ["filename"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"filename": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_image_parent_type_parent_id_created_at", "image", ["parent_type", "parent_id", "created_at"], unique=False
    )
    op.create_index(
        "ix_image_product_created_at",
        "image",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("parent_type = 'PRODUCT'"),
    )
    op.create_table(
        "material",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=True),
        sa.Column("density_kg_m3", sa.Float(), nullable=True),
        sa.Column("is_crm", sa.Boolean(), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('public.relab', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(source, ''))",  # noqa: E501
                persisted=True,
            ),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_material_name"), "material", ["name"], unique=False)
    op.create_index(
        "material_name_trgm_idx",
        "material",
        [sa.literal_column("relab_unaccent(name)").label("name_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.create_index("material_search_vector_idx", "material", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_table(
        "producttype",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('public.relab', coalesce(name, '') || ' ' || coalesce(description, ''))", persisted=True
            ),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_producttype_name"), "producttype", ["name"], unique=False)
    op.create_index(
        "producttype_description_trgm_idx",
        "producttype",
        [sa.literal_column("relab_unaccent(description)").label("description_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"description_unaccent": "gin_trgm_ops"},
    )
    op.create_index(
        "producttype_name_trgm_idx",
        "producttype",
        [sa.literal_column("relab_unaccent(name)").label("name_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.create_index(
        "producttype_search_vector_idx", "producttype", ["search_vector"], unique=False, postgresql_using="gin"
    )
    op.create_table(
        "taxonomy",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "domains",
            postgresql.ARRAY(
                postgresql.ENUM("MATERIALS", "PRODUCTS", "OTHER", name="taxonomydomain", create_type=False)
            ),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("version", sa.String(length=50), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_taxonomy_name"), "taxonomy", ["name"], unique=False)
    op.create_table(
        "user",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("preferences", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("profile_stats", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("profile_stats_computed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_canonical", sa.String(), nullable=False),
        sa.Column("upload_file_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("upload_total_bytes", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("mfa_totp_secret", sa.String(), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False),
        sa.Column("mfa_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mfa_recovery_codes", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("has_usable_password", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("terms_accepted_version", sa.Integer(), nullable=True),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("role", sa.String(length=20), server_default="contributor", nullable=False),
        sa.CheckConstraint("role IN ('contributor', 'lab')", name="ck_user_role_valid"),
        sa.CheckConstraint("upload_file_count >= 0", name="ck_user_upload_file_count_non_negative"),
        sa.CheckConstraint("upload_total_bytes >= 0", name="ck_user_upload_total_bytes_non_negative"),
        sa.PrimaryKeyConstraint("id"),
    )
    # NOT NULL constraint name carried over from the stats_cache -> profile_stats rename
    # PG18 names NOT NULL constraints; this rename fails on PG <= 17.
    op.execute('ALTER TABLE "user" RENAME CONSTRAINT user_profile_stats_not_null TO user_stats_cache_not_null')
    op.create_index(op.f("ix_user_email"), "user", ["email"], unique=True)
    op.create_index(op.f("ix_user_email_canonical"), "user", ["email_canonical"], unique=True)
    op.create_index(op.f("ix_user_username"), "user", ["username"], unique=True)
    op.create_index(
        "user_email_trgm_idx",
        "user",
        ["email"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"email": "gin_trgm_ops"},
    )
    op.create_index(
        "user_username_trgm_idx",
        "user",
        ["username"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"username": "gin_trgm_ops"},
    )
    op.create_table(
        "camera",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("relay_public_key_jwk", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("relay_key_id", sa.String(length=64), nullable=False),
        sa.Column(
            "relay_credential_status",
            postgresql.ENUM("ACTIVE", "REVOKED", name="cameracredentialstatus", create_type=False),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_camera_name"), "camera", ["name"], unique=False)
    op.create_index("ix_camera_owner_id", "camera", ["owner_id"], unique=False)
    op.create_table(
        "category",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("name", sa.String(length=250), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("supercategory_id", sa.Integer(), nullable=True),
        sa.Column("taxonomy_id", sa.Integer(), nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('public.relab', coalesce(name, '') || ' ' || coalesce(description, ''))", persisted=True
            ),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["supercategory_id"],
            ["category.id"],
        ),
        sa.ForeignKeyConstraint(
            ["taxonomy_id"],
            ["taxonomy.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "category_name_trgm_idx",
        "category",
        [sa.literal_column("relab_unaccent(name)").label("name_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.create_index("category_search_vector_idx", "category", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_index(op.f("ix_category_name"), "category", ["name"], unique=False)
    op.create_index("ix_category_supercategory_id", "category", ["supercategory_id"], unique=False)
    op.create_index("ix_category_taxonomy_id", "category", ["taxonomy_id"], unique=False)
    op.create_table(
        "oauthaccount",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("oauth_name", sa.String(), nullable=False),
        sa.Column("access_token", sa.String(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=True),
        sa.Column("refresh_token", sa.String(), nullable=True),
        sa.Column("account_id", sa.String(), nullable=False),
        sa.Column("account_email", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("oauth_name", "account_id", name="uq_oauth_account_identity"),
    )
    op.create_index(op.f("ix_oauthaccount_account_id"), "oauthaccount", ["account_id"], unique=False)
    op.create_index(op.f("ix_oauthaccount_oauth_name"), "oauthaccount", ["oauth_name"], unique=False)
    op.create_index("ix_oauthaccount_user_id", "oauthaccount", ["user_id"], unique=False)
    op.create_table(
        "product",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("amount_in_parent", sa.Integer(), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("product_type_id", sa.Integer(), nullable=True),
        sa.Column("weight_g", sa.Float(), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("width_cm", sa.Float(), nullable=True),
        sa.Column("depth_cm", sa.Float(), nullable=True),
        sa.Column("circularity_properties", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('public.relab', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, ''))",  # noqa: E501
                persisted=True,
            ),
            nullable=True,
        ),
        sa.CheckConstraint(
            "(parent_id IS NULL AND amount_in_parent IS NULL) OR (parent_id IS NOT NULL AND amount_in_parent IS NOT NULL AND amount_in_parent > 0)",  # noqa: E501
            name="product_role_invariants",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["user.id"],
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["product.id"],
        ),
        sa.ForeignKeyConstraint(
            ["product_type_id"],
            ["producttype.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_created_at", "product", ["created_at"], unique=False)
    op.create_index(op.f("ix_product_name"), "product", ["name"], unique=False)
    op.create_index("ix_product_owner_id", "product", ["owner_id"], unique=False)
    op.create_index("ix_product_parent_id", "product", ["parent_id"], unique=False)
    op.create_index("ix_product_product_type_id", "product", ["product_type_id"], unique=False)
    op.create_index(
        "product_brand_trgm_idx",
        "product",
        [sa.literal_column("relab_unaccent(brand)").label("brand_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"brand_unaccent": "gin_trgm_ops"},
    )
    op.create_index(
        "product_model_trgm_idx",
        "product",
        [sa.literal_column("relab_unaccent(model)").label("model_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"model_unaccent": "gin_trgm_ops"},
    )
    op.create_index(
        "product_name_trgm_idx",
        "product",
        [sa.literal_column("relab_unaccent(name)").label("name_unaccent")],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.create_index("product_search_vector_idx", "product", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_table(
        "categorymateriallink",
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["category.id"],
        ),
        sa.ForeignKeyConstraint(
            ["material_id"],
            ["material.id"],
        ),
        sa.PrimaryKeyConstraint("category_id", "material_id"),
    )
    op.create_index("ix_categorymateriallink_material_id", "categorymateriallink", ["material_id"], unique=False)
    op.create_table(
        "categoryproducttypelink",
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("product_type_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["category.id"],
        ),
        sa.ForeignKeyConstraint(
            ["product_type_id"],
            ["producttype.id"],
        ),
        sa.PrimaryKeyConstraint("category_id", "product_type_id"),
    )
    op.create_index(
        "ix_categoryproducttypelink_product_type_id", "categoryproducttypelink", ["product_type_id"], unique=False
    )
    op.create_table(
        "materialproductlink",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column(
            "unit",
            postgresql.ENUM("KILOGRAM", "GRAM", "METER", "CENTIMETER", name="unit", create_type=False),
            nullable=False,
        ),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_materialproductlink_quantity_positive"),
        sa.ForeignKeyConstraint(
            ["material_id"],
            ["material.id"],
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["product.id"],
        ),
        sa.PrimaryKeyConstraint("material_id", "product_id"),
    )
    op.create_index("ix_materialproductlink_product_id", "materialproductlink", ["product_id"], unique=False)
    op.create_table(
        "video",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("video_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["product.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_video_product_id", "video", ["product_id"], unique=False)
    op.create_table(
        "recording_session",
        sa.Column("camera_id", sa.Uuid(), nullable=False),
        sa.Column("broadcast_key", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("video_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["camera_id"], ["camera.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["video_id"], ["video.id"], ondelete="CASCADE", name="fk_recording_session_video_id_video"
        ),
        sa.PrimaryKeyConstraint("camera_id"),
    )
    op.create_index("ix_recording_session_video_id", "recording_session", ["video_id"], unique=False)
    # NOTE: SQLAlchemy ignores postgresql_with on tables; these ALTERs apply the models' reloptions.
    op.execute(
        "ALTER TABLE product SET (autovacuum_vacuum_scale_factor = 0.05, "
        "autovacuum_analyze_scale_factor = 0.02, autovacuum_vacuum_cost_delay = 2)"
    )
    op.execute("ALTER TABLE image SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)")
    op.execute("ALTER TABLE file SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02)")
    # ### end Alembic commands ###


def downgrade() -> None:  # noqa: PLR0915
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index("ix_recording_session_video_id", table_name="recording_session")
    op.drop_table("recording_session")
    op.drop_index("ix_video_product_id", table_name="video")
    op.drop_table("video")
    op.drop_index("ix_materialproductlink_product_id", table_name="materialproductlink")
    op.drop_table("materialproductlink")
    op.drop_index("ix_categoryproducttypelink_product_type_id", table_name="categoryproducttypelink")
    op.drop_table("categoryproducttypelink")
    op.drop_index("ix_categorymateriallink_material_id", table_name="categorymateriallink")
    op.drop_table("categorymateriallink")
    op.drop_index("product_search_vector_idx", table_name="product", postgresql_using="gin")
    op.drop_index(
        "product_name_trgm_idx",
        table_name="product",
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.drop_index(
        "product_model_trgm_idx",
        table_name="product",
        postgresql_using="gin",
        postgresql_ops={"model_unaccent": "gin_trgm_ops"},
    )
    op.drop_index(
        "product_brand_trgm_idx",
        table_name="product",
        postgresql_using="gin",
        postgresql_ops={"brand_unaccent": "gin_trgm_ops"},
    )
    op.drop_index("ix_product_product_type_id", table_name="product")
    op.drop_index("ix_product_parent_id", table_name="product")
    op.drop_index("ix_product_owner_id", table_name="product")
    op.drop_index(op.f("ix_product_name"), table_name="product")
    op.drop_index("ix_product_created_at", table_name="product")
    op.drop_table("product")
    op.drop_index("ix_oauthaccount_user_id", table_name="oauthaccount")
    op.drop_index(op.f("ix_oauthaccount_oauth_name"), table_name="oauthaccount")
    op.drop_index(op.f("ix_oauthaccount_account_id"), table_name="oauthaccount")
    op.drop_table("oauthaccount")
    op.drop_index("ix_category_taxonomy_id", table_name="category")
    op.drop_index("ix_category_supercategory_id", table_name="category")
    op.drop_index(op.f("ix_category_name"), table_name="category")
    op.drop_index("category_search_vector_idx", table_name="category", postgresql_using="gin")
    op.drop_index(
        "category_name_trgm_idx",
        table_name="category",
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.drop_table("category")
    op.drop_index("ix_camera_owner_id", table_name="camera")
    op.drop_index(op.f("ix_camera_name"), table_name="camera")
    op.drop_table("camera")
    op.drop_index(
        "user_username_trgm_idx", table_name="user", postgresql_using="gin", postgresql_ops={"username": "gin_trgm_ops"}
    )
    op.drop_index(
        "user_email_trgm_idx", table_name="user", postgresql_using="gin", postgresql_ops={"email": "gin_trgm_ops"}
    )
    op.drop_index(op.f("ix_user_username"), table_name="user")
    op.drop_index(op.f("ix_user_email_canonical"), table_name="user")
    op.drop_index(op.f("ix_user_email"), table_name="user")
    op.drop_table("user")
    op.drop_index(op.f("ix_taxonomy_name"), table_name="taxonomy")
    op.drop_table("taxonomy")
    op.drop_index("producttype_search_vector_idx", table_name="producttype", postgresql_using="gin")
    op.drop_index(
        "producttype_name_trgm_idx",
        table_name="producttype",
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.drop_index(
        "producttype_description_trgm_idx",
        table_name="producttype",
        postgresql_using="gin",
        postgresql_ops={"description_unaccent": "gin_trgm_ops"},
    )
    op.drop_index(op.f("ix_producttype_name"), table_name="producttype")
    op.drop_table("producttype")
    op.drop_index("material_search_vector_idx", table_name="material", postgresql_using="gin")
    op.drop_index(
        "material_name_trgm_idx",
        table_name="material",
        postgresql_using="gin",
        postgresql_ops={"name_unaccent": "gin_trgm_ops"},
    )
    op.drop_index(op.f("ix_material_name"), table_name="material")
    op.drop_table("material")
    op.drop_index(
        "ix_image_product_created_at", table_name="image", postgresql_where=sa.text("parent_type = 'PRODUCT'")
    )
    op.drop_index("ix_image_parent_type_parent_id_created_at", table_name="image")
    op.drop_index(
        "image_filename_trgm_idx",
        table_name="image",
        postgresql_using="gin",
        postgresql_ops={"filename": "gin_trgm_ops"},
    )
    op.drop_index(
        "image_description_trgm_idx",
        table_name="image",
        postgresql_using="gin",
        postgresql_ops={"description": "gin_trgm_ops"},
    )
    op.drop_table("image")
    op.drop_index("ix_file_parent_type_parent_id", table_name="file")
    op.drop_table("file")
    sa.Enum("PRODUCT", "PRODUCT_TYPE", "MATERIAL", name="fileparenttype").drop(op.get_bind())
    sa.Enum("PRODUCT", "PRODUCT_TYPE", "MATERIAL", name="imageparenttype").drop(op.get_bind())
    sa.Enum("MATERIALS", "PRODUCTS", "OTHER", name="taxonomydomain").drop(op.get_bind())
    sa.Enum("KILOGRAM", "GRAM", "METER", "CENTIMETER", name="unit").drop(op.get_bind())
    sa.Enum("ACTIVE", "REVOKED", name="cameracredentialstatus").drop(op.get_bind())
    op.execute("DROP TEXT SEARCH CONFIGURATION IF EXISTS public.relab")
    op.execute("DROP FUNCTION IF EXISTS public.relab_unaccent(text)")
    op.execute("DROP EXTENSION IF EXISTS unaccent")
    # ### end Alembic commands ###
