"""Database models for data collection on products."""
# spell-checker: ignore trgm

from pydantic import UUID4, computed_field
from sqlalchemy import Computed, ForeignKey, Index, and_, asc, select
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.asyncio import AsyncSession
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
from app.api.background_data.models import Material, ProductType
from app.api.common.models.associations import MaterialProductLinkBase
from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.data_collection.models.base import ProductFieldsMixin
from app.api.file_storage.models import File, Image, MediaParentType, Video


class Product(ProductFieldsMixin, TimeStampMixinBare, Base):
    """Database model for product information."""

    __tablename__ = "product"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    __table_args__ = (
        Index("product_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index("product_name_trgm_idx", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index("product_brand_trgm_idx", "brand", postgresql_using="gin", postgresql_ops={"brand": "gin_trgm_ops"}),
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
    def first_image_id(cls) -> MappedSQLExpression[UUID4 | None]:  # noqa: N805
        """Column property that exposes the first image ID for thumbnails."""
        return column_property(
            select(Image.id)
            .where(Image.parent_type == MediaParentType.PRODUCT)
            .where(Image.parent_id == cls.id)
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

    # Many-to-one: owner
    owner_id: Mapped[UUID4] = mapped_column(ForeignKey("user.id"))
    owner: Mapped[User] = relationship(
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
    def thumbnail_url(self) -> str | None:
        """Return thumbnail URL from the first image."""
        if first_image_id := self.first_image_id:
            return f"/images/{first_image_id}/resized?width=200"
        return None

    @computed_field
    @property
    def is_leaf_node(self) -> bool:
        """Check if the product is a leaf node (no components)."""
        return self.components is None or len(self.components) == 0

    @computed_field
    @property
    def is_base_product(self) -> bool:
        """Check if the product is a base product (no parent)."""
        return self.parent_id is None

    def has_cycles(self) -> bool:
        """Check if the product hierarchy contains cycles."""
        visited: set[int | None] = set()

        def visit(node: Product) -> bool:
            if node.id in visited:
                return True
            visited.add(node.id)
            if node.components:
                for component in node.components:
                    if visit(component):
                        return True
            visited.remove(node.id)
            return False

        return visit(self)

    def components_resolve_to_materials(self) -> bool:
        """Ensure all leaf components have a non-empty bill of materials."""

        def check(node: Product) -> bool:
            if not node.components:
                if not node.bill_of_materials:
                    return False
            else:
                for component in node.components:
                    if not check(component):
                        return False
            return True

        return check(self)

    async def get_total_bill_of_materials(self, session: AsyncSession) -> dict[int, float]:
        """Traverse all components and calculate the total bill of materials."""
        total_materials: dict[int, float] = {}
        visited_products: set[int | None] = set()

        async def traverse(product: Product, quantity_multiplier: float) -> None:
            if product.id in visited_products:
                return
            visited_products.add(product.id)

            await session.refresh(product)

            if product.bill_of_materials:
                for link in product.bill_of_materials:
                    material_id = link.material_id
                    quantity = link.quantity * quantity_multiplier
                    if material_id in total_materials:
                        total_materials[material_id] += quantity
                    else:
                        total_materials[material_id] = quantity

            if product.components:
                for component in product.components:
                    component_quantity = component.amount_in_parent or 1.0
                    await traverse(component, quantity_multiplier * component_quantity)

        await traverse(self, 1.0)
        return total_materials

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

    material_id: Mapped[int] = mapped_column(ForeignKey("material.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id"), primary_key=True)

    material: Mapped[Material] = relationship(lazy="selectin")
    product: Mapped[Product] = relationship(back_populates="bill_of_materials", lazy="selectin")

    def __str__(self) -> str:
        return f"{self.quantity} {self.unit} of {self.material.name} in {self.product.name}"
