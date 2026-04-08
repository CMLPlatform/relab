"""Database models for background data."""

# spell-checker: ignore trgm

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Computed, ForeignKey, Index, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pydantic import BaseModel, ConfigDict, Field

from app.api.common.models.base import Base, TimeStampMixinBare

if TYPE_CHECKING:
    from app.api.file_storage.models import File, Image


### Enums ###
class TaxonomyDomain(StrEnum):
    """Enumeration of taxonomy domains."""

    MATERIALS = "materials"
    PRODUCTS = "products"
    OTHER = "other"


### Pydantic base schemas (shared with schemas.py) ###
class TaxonomyBase(BaseModel):
    """Base schema for Taxonomy. Used by Pydantic schemas only, not ORM."""

    name: str = Field(min_length=2, max_length=100)
    version: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] = set()
    source: str | None = Field(default=None, max_length=500)

    model_config: ConfigDict = ConfigDict(use_enum_values=True)


class CategoryBase(BaseModel):
    """Base schema for Category. Used by Pydantic schemas only, not ORM."""

    name: str = Field(min_length=2, max_length=250)
    description: str | None = Field(default=None, max_length=500)
    external_id: str | None = None


class MaterialBase(BaseModel):
    """Base schema for Material. Used by Pydantic schemas only, not ORM."""

    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    source: str | None = Field(default=None, max_length=100)
    density_kg_m3: float | None = Field(default=None, gt=0)
    is_crm: bool | None = None


class ProductTypeBase(BaseModel):
    """Base schema for ProductType. Used by Pydantic schemas only, not ORM."""

    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)


### Linking Models ###
class CategoryMaterialLink(Base):
    """Association table to link Category with Material."""

    __tablename__ = "categorymateriallink"

    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("material.id"), primary_key=True)


class CategoryProductTypeLink(Base):
    """Association table to link Category with ProductType."""

    __tablename__ = "categoryproducttypelink"

    category_id: Mapped[int] = mapped_column(ForeignKey("category.id"), primary_key=True)
    product_type_id: Mapped[int] = mapped_column(ForeignKey("producttype.id"), primary_key=True)


### Taxonomy Model ###
class Taxonomy(TimeStampMixinBare, Base):
    """Database model for Taxonomy."""

    __tablename__ = "taxonomy"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    version: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    domains: Mapped[set[TaxonomyDomain]] = mapped_column(ARRAY(SAEnum(TaxonomyDomain)))
    source: Mapped[str | None] = mapped_column(String(500), default=None)

    categories: Mapped[list[Category]] = relationship(
        back_populates="taxonomy", cascade="all, delete-orphan"
    )

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


### Category Model ###
class Category(TimeStampMixinBare, Base):
    """Database model for Category."""

    __tablename__ = "category"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(250), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    external_id: Mapped[str | None] = mapped_column(default=None)

    __table_args__ = (
        Index("category_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index("category_name_trgm_idx", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
    )

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR(),
        Computed(
            "to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))",
            persisted=True,
        ),
        default=None,
    )

    # Self-referential relationship
    supercategory_id: Mapped[int | None] = mapped_column(ForeignKey("category.id"), default=None)
    supercategory: Mapped[Category | None] = relationship(
        back_populates="subcategories",
        remote_side="Category.id",
        lazy="selectin",
        join_depth=1,
    )
    subcategories: Mapped[list[Category] | None] = relationship(
        back_populates="supercategory",
        lazy="selectin",
        join_depth=1,
        cascade="all, delete-orphan",
    )

    # Many-to-one relationships
    taxonomy_id: Mapped[int] = mapped_column(ForeignKey("taxonomy.id"))
    taxonomy: Mapped[Taxonomy] = relationship(back_populates="categories")

    # Many-to-many relationships
    materials: Mapped[list[Material] | None] = relationship(
        back_populates="categories", secondary="categorymateriallink"
    )
    product_types: Mapped[list[ProductType] | None] = relationship(
        back_populates="categories", secondary="categoryproducttypelink"
    )

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


### Material Model ###
class Material(TimeStampMixinBare, Base):
    """Database model for Material."""

    __tablename__ = "material"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    source: Mapped[str | None] = mapped_column(String(100), default=None)
    density_kg_m3: Mapped[float | None] = mapped_column(default=None)
    is_crm: Mapped[bool | None] = mapped_column(default=None)

    __table_args__ = (
        Index("material_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index("material_name_trgm_idx", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
    )

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR(),
        Computed(
            "to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || "
            "coalesce(source, ''))",
            persisted=True,
        ),
        default=None,
    )

    # One-to-many relationships
    images: Mapped[list[Image] | None] = relationship(cascade="all, delete-orphan")
    files: Mapped[list[File] | None] = relationship(cascade="all, delete-orphan")

    # Many-to-many relationships
    categories: Mapped[list[Category] | None] = relationship(
        back_populates="materials", secondary="categorymateriallink"
    )

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


### ProductType Model ###
class ProductType(TimeStampMixinBare, Base):
    """Database model for ProductType."""

    __tablename__ = "producttype"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)

    __table_args__ = (
        Index("producttype_search_vector_idx", "search_vector", postgresql_using="gin"),
        Index("producttype_name_trgm_idx", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
    )

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR(),
        Computed(
            "to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))",
            persisted=True,
        ),
        default=None,
    )

    # One-to-many relationships
    files: Mapped[list[File] | None] = relationship(cascade="all, delete-orphan")
    images: Mapped[list[Image] | None] = relationship(cascade="all, delete-orphan")

    # Many-to-many relationships
    categories: Mapped[list[Category] | None] = relationship(
        back_populates="product_types", secondary="categoryproducttypelink"
    )

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"
