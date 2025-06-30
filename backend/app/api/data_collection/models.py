"""Database models for data collection on products."""

from datetime import UTC, datetime
from functools import cached_property
from typing import TYPE_CHECKING, Optional, Self

from pydantic import UUID4, ConfigDict, computed_field, model_validator
from sqlalchemy import TIMESTAMP
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Column, Field, Relationship

from app.api.common.models.associations import MaterialProductLink
from app.api.common.models.base import CustomBase, TimeStampMixinBare

if TYPE_CHECKING:
    from app.api.auth.models import User
    from app.api.background_data.models import ProductType
    from app.api.file_storage.models.models import File, Image, Video


### Validation Utilities ###
def validate_start_and_end_time(start_time: datetime, end_time: datetime | None) -> None:
    """Validate that end time is after start time if both are set."""
    if start_time and end_time and end_time < start_time:
        err_msg: str = f"End time {end_time:%Y-%m-%d %H:%M} must be after start time {start_time:%Y-%m-%d %H:%M}"
        raise ValueError(err_msg)


### Properties Models ###
class PhysicalPropertiesBase(CustomBase):
    """Base model to store physical properties of a product."""

    weight_kg: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    width_cm: float | None = Field(default=None, gt=0)
    depth_cm: float | None = Field(default=None, gt=0)

    # Computed properties
    @computed_field
    @cached_property
    def volume_cm3(self) -> float:
        """Calculate the volume of the product."""
        if self.height_cm is None or self.width_cm is None or self.depth_cm is None:
            err_msg = "All dimensions must be set to calculate the volume."
            raise ValueError(err_msg)
        return self.height_cm * self.width_cm * self.depth_cm


class PhysicalProperties(PhysicalPropertiesBase, TimeStampMixinBare, table=True):
    """Model to store physical properties of a product."""

    id: int | None = Field(default=None, primary_key=True)

    # One-to-one relationships
    product_id: int = Field(foreign_key="product.id")
    product: "Product" = Relationship(back_populates="physical_properties")


### Product Model ###
class ProductBase(CustomBase):
    """Basic model to store product information."""

    name: str = Field(index=True, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)

    # Dismantling information
    dismantling_notes: str | None = Field(
        default=None, max_length=500, description="Notes on the dismantling process of the product."
    )

    dismantling_time_start: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=False), default_factory=lambda: datetime.now(UTC)
    )
    dismantling_time_end: datetime | None = Field(default=None, sa_column=Column(TIMESTAMP(timezone=True)))

    # Time validation
    @model_validator(mode="after")
    def validate_times(self) -> Self:
        """Ensure end time is after start time if both are set."""
        validate_start_and_end_time(self.dismantling_time_start, self.dismantling_time_end)
        return self


class Product(ProductBase, TimeStampMixinBare, table=True):
    """Database model for product information."""

    id: int | None = Field(default=None, primary_key=True)

    # Self-referential relationship for hierarchy
    parent_id: int | None = Field(default=None, foreign_key="product.id")
    parent: Optional["Product"] = Relationship(
        back_populates="components",
        sa_relationship_kwargs={
            "uselist": False,
            "remote_side": "Product.id",
            "lazy": "selectin",  # Eagerly load linked component products
            "join_depth": 1,
        },
    )
    amount_in_parent: int | None = Field(default=None, description="Quantity within parent product")
    components: list["Product"] | None = Relationship(
        back_populates="parent",
        cascade_delete=True,
        sa_relationship_kwargs={"lazy": "selectin", "join_depth": 1},  # Eagerly load linked parent product
    )

    # One-to-one relationships
    physical_properties: PhysicalProperties | None = Relationship(
        back_populates="product", cascade_delete=True, sa_relationship_kwargs={"uselist": False, "lazy": "selectin"}
    )

    # Many-to-one relationships
    files: list["File"] | None = Relationship(back_populates="product", cascade_delete=True)
    images: list["Image"] | None = Relationship(back_populates="product", cascade_delete=True)
    videos: list["Video"] | None = Relationship(back_populates="product", cascade_delete=True)

    # One-to-many relationships
    owner_id: UUID4 = Field(foreign_key="user.id")
    owner: "User" = Relationship(
        back_populates="products", sa_relationship_kwargs={"uselist": False, "lazy": "selectin"}
    )

    product_type_id: int | None = Field(default=None, foreign_key="producttype.id")
    product_type: "ProductType" = Relationship(back_populates="products", sa_relationship_kwargs={"uselist": False})

    # Many-to-many relationships
    bill_of_materials: list[MaterialProductLink] | None = Relationship(
        back_populates="product", sa_relationship_kwargs={"lazy": "selectin"}, cascade_delete=True
    )

    # Helper methods
    @computed_field
    @cached_property
    def is_leaf_node(self) -> bool:
        """Check if the product is a leaf node (no components)."""
        return self.components is None or len(self.components) == 0

    @computed_field
    @cached_property
    def is_base_product(self) -> bool:
        """Check if the product is a base product (no parent)."""
        return self.parent_id is None

    # TODO: move this validation to the CRUD and schema layers

    def has_cycles(self) -> bool:
        """Check if the product hierarchy contains cycles."""
        visited = set()

        def visit(node: "Product") -> bool:
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

        def check(node: "Product") -> bool:
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

    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True)  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855

    def __str__(self):
        return f"{self.name} (id: {self.id})"
