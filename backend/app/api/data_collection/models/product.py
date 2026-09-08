"""Database models for data collection on products."""

from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import CheckConstraint, Computed, ForeignKey, Index, and_, asc, func, literal_column, select
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import (
    Mapped,
    MappedSQLExpression,
    column_property,
    declared_attr,
    foreign,
    mapped_column,
    relationship,
)

from app.api.auth.models import User
from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.data_collection.models.base import MaterialProductLinkBase, ProductFieldsMixin
from app.api.file_storage.models import File, Image, MediaParentType, Video
from app.api.file_storage.parents import register_media_parent
from app.api.reference_data.models import Material, ProductType

if TYPE_CHECKING:
    from typing import Any


class Product(ProductFieldsMixin, TimeStampMixinBare, Base):
    """Database model for product information."""

    __tablename__ = "product"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    __table_args__ = (
        Index("product_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index(
            "product_name_trgm_idx",
            func.relab_unaccent(literal_column("name")).label("name_unaccent"),
            postgresql_using="gin",
            postgresql_ops={"name_unaccent": "gin_trgm_ops"},
        ),
        Index(
            "product_brand_trgm_idx",
            func.relab_unaccent(literal_column("brand")).label("brand_unaccent"),
            postgresql_using="gin",
            postgresql_ops={"brand_unaccent": "gin_trgm_ops"},
        ),
        # The model suggestion endpoint trigram-matches this column in an OR with
        # search_vector; an unindexed side seq-scans the whole OR.
        Index(
            "product_model_trgm_idx",
            func.relab_unaccent(literal_column("model")).label("model_unaccent"),
            postgresql_using="gin",
            postgresql_ops={"model_unaccent": "gin_trgm_ops"},
        ),
        # Media quota checks and base-product listings filter on owner.
        Index("ix_product_owner_id", "owner_id"),
        # Components load eagerly on every product read.
        Index("ix_product_parent_id", "parent_id"),
        Index("ix_product_product_type_id", "product_type_id"),
        # Sort key and range filter on the product list; stats series bucket by it.
        Index("ix_product_created_at", "created_at"),
        CheckConstraint(
            "(parent_id IS NULL AND amount_in_parent IS NULL) "
            "OR (parent_id IS NOT NULL AND amount_in_parent IS NOT NULL AND amount_in_parent > 0)",
            name="product_role_invariants",
        ),
        {
            "postgresql_with": {
                "autovacuum_vacuum_scale_factor": 0.05,
                "autovacuum_analyze_scale_factor": 0.02,
                "autovacuum_vacuum_cost_delay": 2,
            }
        },
    )

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR(),
        # NOTE: 'public.relab' unaccents through relab_unaccent(), a string-bodied IMMUTABLE
        # wrapper created by the migration; pg_dump restores it with check_function_bodies off.
        Computed(
            "to_tsvector('public.relab', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || "
            "coalesce(brand, '') || ' ' || coalesce(model, ''))",
            persisted=True,
        ),
        default=None,
    )

    @declared_attr
    def first_image_file(self) -> MappedSQLExpression[Any | None]:
        """Column property exposing the earliest image's stored file, for thumbnails.

        One correlated subquery per row, so list reads need not load ``images``.
        """
        return column_property(
            select(Image.file)
            .where(Image.parent_type == MediaParentType.PRODUCT)
            .where(Image.parent_id == self.id)
            .correlate_except(Image)
            .order_by(asc(Image.created_at))
            .limit(1)
            .scalar_subquery()
        )

    parent_id: Mapped[int | None] = mapped_column(ForeignKey("product.id"), default=None)
    parent: Mapped[Product | None] = relationship(
        back_populates="components",
        uselist=False,
        remote_side="Product.id",
        lazy="selectin",
        join_depth=1,
    )
    amount_in_parent: Mapped[int | None] = mapped_column(default=None)
    components: Mapped[list[Product] | None] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="selectin",
        join_depth=1,
    )

    # Generic media FK, no DB-level constraint.
    files: Mapped[list[File] | None] = relationship(
        primaryjoin=lambda: and_(
            Product.id == foreign(File.parent_id),
            File.parent_type == MediaParentType.PRODUCT,
        ),
        cascade="all, delete-orphan",
        overlaps="files,images",
    )
    images: Mapped[list[Image] | None] = relationship(
        primaryjoin=lambda: and_(
            Product.id == foreign(Image.parent_id),
            Image.parent_type == MediaParentType.PRODUCT,
        ),
        cascade="all, delete-orphan",
        lazy="selectin",
        overlaps="files,images",
    )
    videos: Mapped[list[Video] | None] = relationship(cascade="all, delete-orphan")

    # NOT NULL: components denormalize their root product's owner so per-owner queries
    # stay O(1). The Python type allows None so privacy redaction can clear it in memory.
    owner_id: Mapped[UUID4 | None] = mapped_column(ForeignKey("user.id"), nullable=False)
    owner: Mapped[User | None] = relationship(
        uselist=False,
        lazy="selectin",
        foreign_keys="[Product.owner_id]",
    )

    product_type_id: Mapped[int | None] = mapped_column(ForeignKey("producttype.id"), default=None)
    product_type: Mapped[ProductType] = relationship(uselist=False)

    bill_of_materials: Mapped[list[MaterialProductLink] | None] = relationship(
        back_populates="product", lazy="selectin", cascade="all, delete-orphan"
    )

    @property
    def is_leaf_node(self) -> bool:
        """Check if the product is a leaf node (no components)."""
        return self.components is None or len(self.components) == 0

    @property
    def is_base_product(self) -> bool:
        """Check if the product is a base product (no parent)."""
        return self.parent_id is None

    @property
    def owner_username(self) -> str | None:
        """Return the owner's username."""
        return self.owner.username if self.owner else None

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


class MaterialProductLink(MaterialProductLinkBase, TimeStampMixinBare, Base):
    """Association table to link Material with Product."""

    __tablename__ = "materialproductlink"
    # The composite primary key already indexes material_id as its leading column.
    __table_args__ = (
        Index("ix_materialproductlink_product_id", "product_id"),
        CheckConstraint("quantity > 0", name="ck_materialproductlink_quantity_positive"),
    )

    material_id: Mapped[int] = mapped_column(ForeignKey("material.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), primary_key=True)

    material: Mapped[Material] = relationship(lazy="selectin")
    product: Mapped[Product] = relationship(back_populates="bill_of_materials", lazy="selectin")

    def __str__(self) -> str:
        return f"{self.quantity} {self.unit} of {self.material.name} in {self.product.name}"


# Media parents this context owns; registered here so file_storage never imports it.
register_media_parent(MediaParentType.PRODUCT, Product)
