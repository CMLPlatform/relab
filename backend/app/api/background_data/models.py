"""Database models for background data."""

from enum import Enum
from typing import TYPE_CHECKING, Optional

from pydantic import ConfigDict
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlmodel import Column, Field, Relationship

from app.api.common.models.base import CustomBase, CustomLinkingModelBase, TimeStampMixinBare
from app.api.file_storage.models.models import File, Image

if TYPE_CHECKING:
    from app.api.common.models.associations import MaterialProductLink
    from app.api.data_collection.models import Product


### Linking Models ###
class CategoryMaterialLink(CustomLinkingModelBase, table=True):
    """Association table to link Category with Material."""

    category_id: int = Field(foreign_key="category.id", primary_key=True)
    material_id: int = Field(foreign_key="material.id", primary_key=True)


class CategoryProductTypeLink(CustomLinkingModelBase, table=True):
    """Association table to link Category with ProductType."""

    category_id: int = Field(foreign_key="category.id", primary_key=True)
    product_type_id: int = Field(foreign_key="producttype.id", primary_key=True)


### Taxonomy Model ###
class TaxonomyDomain(str, Enum):
    """Enumeration of taxonomy domains."""

    MATERIALS = "materials"
    PRODUCTS = "products"
    OTHER = "other"


class TaxonomyBase(CustomBase):
    """Base model for Taxonomy."""

    name: str = Field(index=True, min_length=2, max_length=100)
    version: str | None = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] = Field(
        sa_column=Column(ARRAY(SAEnum(TaxonomyDomain))),
        description=f"Domains of the taxonomy, e.g. {{{', '.join([d.value for d in TaxonomyDomain][:3])}}}",
    )

    # TODO: Implement Source model
    source: str | None = Field(
        default=None, max_length=500, description="Source of the taxonomy data, e.g. URL, IRI or citation key"
    )

    model_config: ConfigDict = ConfigDict(use_enum_values=True)


class Taxonomy(TaxonomyBase, TimeStampMixinBare, table=True):
    """Database model for Taxonomy."""

    id: int | None = Field(default=None, primary_key=True)

    categories: list[Category] = Relationship(back_populates="taxonomy", cascade_delete=True)

    model_config: ConfigDict = ConfigDict(use_enum_values=True, arbitrary_types_allowed=True)

    # Magic methods
    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


### Category Model ###
class CategoryBase(CustomBase):
    """Base model for Category."""

    name: str = Field(index=True, min_length=2, max_length=250, description="Name of the category")
    description: str | None = Field(default=None, max_length=500, description="Description of the category")
    external_id: str | None = Field(default=None, description="ID of the category in the external taxonomy")


class Category(CategoryBase, TimeStampMixinBare, table=True):
    """Database model for Category."""

    id: int | None = Field(default=None, primary_key=True)

    # Self-referential relationship
    supercategory_id: int | None = Field(foreign_key="category.id", default=None, nullable=True)
    supercategory: Optional["Category"] = Relationship(  # noqa: UP037, UP045 # `Optional` and quotes needed for proper sqlalchemy mapping
        back_populates="subcategories",
        sa_relationship_kwargs={"remote_side": "Category.id", "lazy": "selectin", "join_depth": 1},
    )
    subcategories: list[Category] | None = Relationship(
        back_populates="supercategory",
        sa_relationship_kwargs={"lazy": "selectin", "join_depth": 1},
        cascade_delete=True,
    )

    # Many-to-one relationships
    taxonomy_id: int = Field(foreign_key="taxonomy.id")
    taxonomy: Taxonomy = Relationship(back_populates="categories")

    # Many-to-many relationships. This is ugly but SQLModel doesn't allow for polymorphic association.
    materials: list[Material] | None = Relationship(back_populates="categories", link_model=CategoryMaterialLink)
    product_types: list[ProductType] | None = Relationship(
        back_populates="categories", link_model=CategoryProductTypeLink
    )

    # Magic methods
    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


### Material Model ###
class MaterialBase(CustomBase):
    """Base model for Material."""

    name: str = Field(index=True, min_length=2, max_length=100, description="Name of the Material")
    description: str | None = Field(default=None, max_length=500, description="Description of the Material")
    source: str | None = Field(
        default=None, max_length=100, description="Source of the material data, e.g. URL, IRI or citation key"
    )
    density_kg_m3: float | None = Field(default=None, gt=0, description="Volumetric density (kg/m³) ")
    is_crm: bool | None = Field(default=None, description="Is this material a Critical Raw Material (CRM)?")


class Material(MaterialBase, TimeStampMixinBare, table=True):
    """Database model for Material."""

    id: int | None = Field(default=None, primary_key=True)

    # One-to-many relationships
    images: list[Image] | None = Relationship(cascade_delete=True)
    files: list[File] | None = Relationship(cascade_delete=True)

    # Many-to-many relationships
    categories: list[Category] | None = Relationship(back_populates="materials", link_model=CategoryMaterialLink)
    product_links: list[MaterialProductLink] | None = Relationship(back_populates="material")

    # Magic methods
    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


### ProductType Model ###
class ProductTypeBase(CustomBase):
    """Base model for ProductType."""

    name: str = Field(index=True, min_length=2, max_length=100, description="Name of the Product Type.")
    description: str | None = Field(default=None, max_length=500, description="Description of the Product Type.")


class ProductType(ProductTypeBase, TimeStampMixinBare, table=True):
    """Database model for ProductType."""

    id: int | None = Field(default=None, primary_key=True)

    # One-to-many relationships
    products: list[Product] | None = Relationship(back_populates="product_type")
    files: list[File] | None = Relationship(back_populates="product_type", cascade_delete=True)
    images: list[Image] | None = Relationship(back_populates="product_type", cascade_delete=True)

    # Many-to-many relationships
    categories: list[Category] | None = Relationship(
        back_populates="product_types",
        link_model=CategoryProductTypeLink,
    )

    # Magic methods
    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"
