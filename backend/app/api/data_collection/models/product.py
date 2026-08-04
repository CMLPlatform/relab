"""Database models for data collection on products."""

from typing import TYPE_CHECKING

from pydantic import UUID4
from sqlalchemy import CheckConstraint, Computed, ForeignKey, Index, and_, asc, select, text
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
from app.api.common.models.associations import MaterialProductLinkBase
from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.data_collection.models.base import ProductFieldsMixin
from app.api.file_storage.models import File, Image, MediaParentType, Video
from app.api.reference_data.models import Material, ProductType

if TYPE_CHECKING:
    from typing import Any


class Product(ProductFieldsMixin, TimeStampMixinBare, Base):
    """Database model for product information."""

    __tablename__ = "product"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    __table_args__ = (
        Index("product_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index("product_name_trgm_idx", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index("product_brand_trgm_idx", "brand", postgresql_using="gin", postgresql_ops={"brand": "gin_trgm_ops"}),
        # All owned rows, including components; used for product-owned media quota checks.
        Index("ix_product_owner_id", "owner_id"),
        # Base products only; keeps user product-list queries on a smaller targeted index.
        Index("ix_product_base_owner_id", "owner_id", postgresql_where=text("parent_id IS NULL")),
        # Components load eagerly on every product read, and the delete cascade
        # walks the same column.
        Index("ix_product_parent_id", "parent_id"),
        Index("ix_product_product_type_id", "product_type_id"),
        CheckConstraint(
            "(parent_id IS NULL AND amount_in_parent IS NULL) "
            "OR (parent_id IS NOT NULL AND amount_in_parent IS NOT NULL)",
            name="product_role_invariants",
        ),
    )

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR(),
        Computed(
            "to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || "
            "coalesce(brand, '') || ' ' || coalesce(model, ''))",
            persisted=True,
        ),
        default=None,
    )

    @declared_attr
    def first_image_file(self) -> MappedSQLExpression[Any | None]:
        """Column property exposing the earliest image's stored file, for thumbnails.

        Lets summary reads (product lists, component lists) carry a thumbnail
        without loading the ``images`` relationship — one correlated subquery
        per row instead of an extra round-trip per page.
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

    # Self-referential relationship for hierarchy
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

    # One-to-many relationships (file storage) — generic FK, no DB-level constraint
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

    # Many-to-one: owner. NOT NULL on every row — components denormalize their
    # root base product's owner so ownership and per-owner queries stay O(1).
    # Both ProductRead and ComponentRead expose owner_id so clients can key
    # ownership on the stable user id rather than a mutable username.
    # Python type allows None so privacy redaction can clear it in memory.
    owner_id: Mapped[UUID4 | None] = mapped_column(ForeignKey("user.id"), nullable=False)
    owner: Mapped[User | None] = relationship(
        uselist=False,
        lazy="selectin",
        foreign_keys="[Product.owner_id]",
    )

    # Many-to-one: product type
    product_type_id: Mapped[int | None] = mapped_column(ForeignKey("producttype.id"), default=None)
    product_type: Mapped[ProductType] = relationship(uselist=False)

    # Many-to-many: bill of materials
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


### MaterialProductLink; lives here so Product and Material are both in scope ###
class MaterialProductLink(MaterialProductLinkBase, TimeStampMixinBare, Base):
    """Association table to link Material with Product."""

    __tablename__ = "materialproductlink"
    __table_args__ = (
        Index("ix_materialproductlink_material_id", "material_id"),
        Index("ix_materialproductlink_product_id", "product_id"),
    )

    material_id: Mapped[int] = mapped_column(ForeignKey("material.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), primary_key=True)

    material: Mapped[Material] = relationship(lazy="selectin")
    product: Mapped[Product] = relationship(back_populates="bill_of_materials", lazy="selectin")

    def __str__(self) -> str:
        return f"{self.quantity} {self.unit} of {self.material.name} in {self.product.name}"
