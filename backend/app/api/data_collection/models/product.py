"""Database models for data collection on products."""
# spell-checker: ignore trgm

from typing import (  # Needed for runtime ORM mapping, not just for type annotations
    TYPE_CHECKING,
    Optional,
    Self,
)

from pydantic import UUID4, ConfigDict, computed_field, model_validator
from sqlalchemy import Computed, Index, asc
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import MappedSQLExpression, column_property
from sqlmodel import Column, Field, Relationship, col, select

from app.api.auth.models import User
from app.api.background_data.models import Material, ProductType
from app.api.common.models.associations import MaterialProductLinkBase
from app.api.common.models.base import TimeStampMixinBare
from app.api.data_collection.models.base import ProductBase
from app.api.file_storage.models import File, Image, MediaParentType, Video


class Product(ProductBase, TimeStampMixinBare, table=True):
    """Database model for product information."""

    id: int | None = Field(default=None, primary_key=True)

    __table_args__ = (
        Index("product_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index("product_name_trgm_idx", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
        Index("product_brand_trgm_idx", "brand", postgresql_using="gin", postgresql_ops={"brand": "gin_trgm_ops"}),
    )

    search_vector: str | None = Field(
        default=None,
        exclude=True,
        sa_column=Column(
            TSVECTOR(),
            Computed(
                "to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || "
                "coalesce(brand, '') || ' ' || coalesce(model, ''))",
                persisted=True,
            ),
        ),
    )

    if TYPE_CHECKING:
        # Populated at runtime via `column_property` below.
        first_image_id: MappedSQLExpression[UUID4 | None]

    # Self-referential relationship for hierarchy
    parent_id: int | None = Field(default=None, foreign_key="product.id")
    parent: Optional["Product"] = Relationship(  # noqa: UP037, UP045 # `Optional` and quotes needed for proper sqlalchemy mapping
        back_populates="components",
        sa_relationship_kwargs={
            "uselist": False,
            "remote_side": "Product.id",
            "lazy": "selectin",  # Eagerly load linked component products
            "join_depth": 1,
        },
    )
    amount_in_parent: int | None = Field(default=None, description="Quantity within parent product")
    components: list[Product] | None = Relationship(
        back_populates="parent",
        cascade_delete=True,
        sa_relationship_kwargs={"lazy": "selectin", "join_depth": 1},  # Eagerly load linked parent product
    )

    # Many-to-one relationships
    files: list[File] | None = Relationship(cascade_delete=True)
    images: list[Image] | None = Relationship(cascade_delete=True, sa_relationship_kwargs={"lazy": "selectin"})
    videos: list[Video] | None = Relationship(cascade_delete=True)

    # One-to-many relationships
    owner_id: UUID4 = Field(foreign_key="user.id")
    owner: User = Relationship(
        sa_relationship_kwargs={
            "uselist": False,
            "lazy": "selectin",
            "foreign_keys": "[Product.owner_id]",
        },
    )

    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")
    product_type: ProductType = Relationship(sa_relationship_kwargs={"uselist": False})

    # Many-to-many relationships
    bill_of_materials: list["MaterialProductLink"] | None = Relationship(  # noqa: UP037 # forward ref; class defined below
        back_populates="product", sa_relationship_kwargs={"lazy": "selectin"}, cascade_delete=True
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

    # TODO: move this validation to the CRUD and schema layers.
    def has_cycles(self) -> bool:
        """Check if the product hierarchy contains cycles."""
        visited = set()

        def visit(node: Product) -> bool:
            if node.id in visited:
                return True  # Cycle detected
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
                # Leaf node
                if not node.bill_of_materials:
                    return False
            else:
                for component in node.components:
                    if not check(component):
                        return False
            return True

        return check(self)

    @model_validator(mode="after")
    def validate_product(self) -> Self:
        """Validate the product hierarchy and bill of materials constraints."""
        components: list[Product] | None = self.components
        bill_of_materials: list[MaterialProductLink] | None = self.bill_of_materials
        amount_in_parent: int | None = self.amount_in_parent

        if self.has_cycles():
            err_msg = "Cycle detected: a product cannot contain itself directly or indirectly."
            raise ValueError(err_msg)

        if self.is_base_product:
            if not components and not bill_of_materials:
                err_msg = "A product must have at least one material or one component."
                raise ValueError(err_msg)
            if amount_in_parent is not None:
                err_msg = "Base product must have amount_in_parent set to None."
                raise ValueError(err_msg)

        else:
            # Intermediate product
            if amount_in_parent is None:
                err_msg = "Intermediate product must have amount_in_parent set."
                raise ValueError(err_msg)
            if not components and not bill_of_materials:
                err_msg = "Intermediate product must have at least one material or one component."
                raise ValueError(err_msg)

        # Ensure all components ultimately resolve to materials
        if not self.components_resolve_to_materials():
            err_msg = "All leaf components must have a non-empty bill of materials."
            raise ValueError(err_msg)
        return self

    async def get_total_bill_of_materials(self, session: AsyncSession) -> dict[int, float]:
        """Traverse all components and calculate the total bill of materials for the product.

        Args:
            session: The database session to use for loading relationships.

        Returns:
            A dictionary mapping material IDs to total quantities.
        """
        total_materials = {}
        visited_products = set()

        async def traverse(product: Product, quantity_multiplier: float) -> None:
            """Recursively traverse the product hierarchy and aggregate bill of materials."""
            if product.id in visited_products:
                return
            visited_products.add(product.id)

            # Ensure components and bill_of_materials are loaded
            await session.refresh(product)
            await session.refresh(product.components)
            await session.refresh(product.bill_of_materials)

            # Collect materials from the current product's bill_of_materials
            if product.bill_of_materials:
                for link in product.bill_of_materials:
                    material_id = link.material_id
                    quantity = link.quantity * quantity_multiplier
                    # Aggregate quantities
                    if material_id in total_materials:
                        total_materials[material_id] += quantity
                    else:
                        total_materials[material_id] = quantity

            # Traverse components
            if product.components:
                for component in product.components:
                    component_quantity = component.amount_in_parent or 1.0
                    await traverse(component, quantity_multiplier * component_quantity)

        await traverse(self, 1.0)
        return total_materials

    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True)

    @property
    def owner_username(self) -> str | None:
        """Return the owner's username. Always available since owner is selectin-loaded."""
        return self.owner.username if self.owner else None

    def __str__(self):
        return f"{self.name} (id: {self.id})"


Product.first_image_id = column_property(
    select(Image.id)
    .where(Image.parent_type == MediaParentType.PRODUCT)
    .where(Image.product_id == Product.id)
    .correlate_except(Image)
    .order_by(asc(col(Image.created_at)))
    .limit(1)
    .scalar_subquery()
)


### MaterialProductLink; lives here so Product and Material are both in scope ###
class MaterialProductLink(MaterialProductLinkBase, TimeStampMixinBare, table=True):
    """Association table to link Material with Product."""

    material_id: int = Field(
        foreign_key="material.id", primary_key=True, description="ID of the material in the product"
    )
    product_id: int = Field(
        foreign_key="product.id", primary_key=True, description="ID of the product with the material"
    )

    material: Material = Relationship(sa_relationship_kwargs={"lazy": "selectin"})
    product: Product = Relationship(back_populates="bill_of_materials", sa_relationship_kwargs={"lazy": "selectin"})

    def __str__(self) -> str:
        return f"{self.quantity} {self.unit} of {self.material.name} in {self.product.name}"
