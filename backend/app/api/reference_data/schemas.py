"""Pydantic models used to validate CRUD operations for reference data."""

from pydantic import BaseModel, ConfigDict, Field, PositiveInt, field_validator

from app.api.common.schemas.base import (
    AssociationModelReadSchemaWithTimeStamp,
    BaseCreateSchema,
    BaseUpdateSchema,
    IntIdReadSchema,
    IntIdReadSchemaWithTimeStamp,
    MaterialProductLinkBase,
)
from app.api.common.schemas.field_mixins import MaterialFields
from app.api.common.validation import MultilineUserText, SingleLineUserText
from app.api.data_collection.product_schemas import ProductSummary
from app.api.file_storage.schemas import FileRead, ImageRead
from app.api.reference_data.examples import (
    CATEGORY_READ_AS_SUBCATEGORY_EXAMPLES,
    CATEGORY_READ_EXAMPLES,
    CATEGORY_READ_RECURSIVE_EXAMPLES,
    CATEGORY_UPDATE_EXAMPLES,
    TAXONOMY_READ_EXAMPLES,
)
from app.api.reference_data.models import TaxonomyDomain


class TaxonomyBase(BaseModel):
    """Shared base fields for taxonomy schemas."""

    model_config = ConfigDict(use_enum_values=True)
    name: SingleLineUserText = Field(min_length=2, max_length=100)
    version: SingleLineUserText | None = Field(default=None, min_length=1, max_length=50)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] = set()
    source: SingleLineUserText | None = Field(default=None, max_length=500)


class CategoryBase(BaseModel):
    """Shared base fields for category schemas."""

    name: SingleLineUserText = Field(min_length=2, max_length=250)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    external_id: SingleLineUserText | None = None


class MaterialBase(BaseModel):
    """Shared base fields for material schemas."""

    name: SingleLineUserText = Field(min_length=2, max_length=100)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    source: SingleLineUserText | None = Field(default=None, max_length=100)
    density_kg_m3: float | None = Field(default=None, gt=0)
    is_crm: bool | None = None


class ProductTypeBase(BaseModel):
    """Shared base fields for product-type schemas."""

    name: SingleLineUserText = Field(min_length=2, max_length=100)
    description: MultilineUserText | None = Field(default=None, max_length=500)


class CategoryFields(BaseModel):
    """Shared category fields for API schemas."""

    name: str = Field(min_length=2, max_length=250, description="Name of the category")
    description: str | None = Field(default=None, max_length=500, description="Description of the category")
    external_id: str | None = Field(default=None, description="ID of the category in the external taxonomy")


class ProductTypeFields(BaseModel):
    """Shared product-type fields for API schemas."""

    name: str = Field(min_length=2, max_length=100, description="Name of the Product Type.")
    description: str | None = Field(default=None, max_length=500, description="Description of the Product Type.")


class TaxonomyFields(BaseModel):
    """Shared taxonomy fields for API schemas."""

    model_config = ConfigDict(use_enum_values=True)

    name: str = Field(min_length=2, max_length=100)
    version: str | None = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] = Field(
        description=f"Domains of the taxonomy, e.g. {{{', '.join([d.value for d in TaxonomyDomain][:3])}}}"
    )
    source: str | None = Field(
        default=None,
        max_length=500,
        description="Source of the taxonomy data, e.g. URL, IRI or citation key",
    )


### Material base schemas ###


class MaterialRead(IntIdReadSchema, MaterialFields):
    """Schema for reading material information."""


class MaterialProductLinkReadWithinMaterial(AssociationModelReadSchemaWithTimeStamp, MaterialProductLinkBase):
    """Schema for reading material-product links from the material side."""

    product_id: PositiveInt
    product: ProductSummary


### Category Schemas ###
## Create Schemas ##
class CategoryCreate(BaseCreateSchema, CategoryBase):
    """Schema for creating a category, optionally with nested subcategories.

    - ``taxonomy_id`` is required for root categories and ignored when
      ``supercategory_id`` is provided (the parent's taxonomy is inherited).
    - ``supercategory_id`` is optional; when set the new category becomes a
      nested category under that parent.
    """

    taxonomy_id: PositiveInt | None = None
    supercategory_id: PositiveInt | None = None
    subcategories: list[CategoryCreate] = Field(
        default_factory=list,
        description="List of subcategories to create under this category",
    )


# Rebuild schema to allow for nested subcategories
CategoryCreate.model_rebuild()


## Read Schemas ##
class CategoryReadAsSubCategory(IntIdReadSchema, CategoryFields):
    """Schema for reading subcategory information."""

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": CATEGORY_READ_AS_SUBCATEGORY_EXAMPLES})


class CategoryRead(CategoryReadAsSubCategory):
    """Schema for reading flat category information."""

    taxonomy_id: PositiveInt = Field(description="ID of the taxonomy")
    supercategory_id: PositiveInt | None = None

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": CATEGORY_READ_EXAMPLES})


class CategoryReadWithRelationships(CategoryRead):
    """Schema for reading category information with all relationships."""

    materials: list[MaterialRead] = Field(default_factory=list, description="List of materials linked to the category")
    product_types: list[ProductTypeRead] = Field(
        default_factory=list, description="List of product types linked to the category"
    )


class CategoryReadWithRelationshipsAndFlatSubCategories(CategoryReadWithRelationships):
    """Schema for reading category information with flat (one level deep) subcategories."""

    subcategories: list[CategoryReadAsSubCategory] = Field(default_factory=list, description="List of subcategories")


class CategoryReadAsSubCategoryWithRecursiveSubCategories(CategoryReadAsSubCategory):
    """Schema for reading category information with recursive subcategories."""

    subcategories: list[CategoryReadAsSubCategoryWithRecursiveSubCategories] = Field(
        default_factory=list, description="List of subcategories"
    )

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": CATEGORY_READ_RECURSIVE_EXAMPLES})


# # Rebuild schema to allow for nested subcategories
CategoryReadAsSubCategoryWithRecursiveSubCategories.model_rebuild()


class CategoryReadWithRecursiveSubCategories(CategoryRead):
    """Schema for reading base category information with recursive subcategories."""

    subcategories: list[CategoryReadAsSubCategoryWithRecursiveSubCategories] = Field(
        default_factory=list, description="List of subcategories"
    )


## Update Schemas ##
class CategoryUpdate(BaseUpdateSchema):
    """Schema for the partial update of a category.

    Updating the parent_id or taxonomy_id is not allowed, as it greatly increases the risk
    for self-referential loops and other inconsistencies.
    """

    # TODO: Add functionality to move a category to a different taxonomy or supercategory.
    # This requires additional validation to prevent self-referential loops and other inconsistencies.

    name: SingleLineUserText | None = Field(
        default=None, min_length=2, max_length=100, description="Name of the category"
    )
    description: MultilineUserText | None = Field(
        default=None, max_length=500, description="Description of the category"
    )

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": CATEGORY_UPDATE_EXAMPLES})


### Taxonomy Schemas ###
## Create Schemas ##
class TaxonomyCreateWithCategories(BaseCreateSchema, TaxonomyBase):
    """Schema for creating a new taxonomy, optionally with new categories."""

    categories: list[CategoryCreate] = Field(default_factory=list, description="Categories to create in this taxonomy")


## Read Schemas ##
class TaxonomyRead(IntIdReadSchemaWithTimeStamp, TaxonomyFields):
    """Schema for reading minimal taxonomy information."""

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": TAXONOMY_READ_EXAMPLES})


class TaxonomyUpdate(BaseUpdateSchema):
    """Schema for the partial update of a taxonomy."""

    name: SingleLineUserText | None = Field(default=None, min_length=2, max_length=50)
    version: SingleLineUserText | None = Field(default=None, min_length=1, max_length=50)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] | None = Field(
        default=None,
        description="Domains of the taxonomy, e.g. {" + f"{', '.join([d.value for d in TaxonomyDomain][:3])}" + "}",
    )

    source: SingleLineUserText | None = Field(default=None, max_length=50, description="Source of the taxonomy data")

    @field_validator("name", "domains")
    @classmethod
    def _forbid_explicit_null(cls, value: object) -> object:
        """These columns are NOT NULL: the field may be omitted, but not set to null."""
        if value is None:
            msg = "Field may be omitted but not null."
            raise ValueError(msg)
        return value


### Material Schemas ###
## Create Schemas ##
class MaterialCreateWithCategories(BaseCreateSchema, MaterialBase):
    """Schema for creating a material with links to existing categories."""

    category_ids: set[int] = Field(default_factory=set, description="List of category IDs")


## Read Schemas ##
class MaterialReadWithRelationships(MaterialRead):
    """Schema for reading material information with all relationships."""

    categories: list[CategoryRead] = Field(
        default_factory=list, description="List of categories linked to the material"
    )
    product_links: list[MaterialProductLinkReadWithinMaterial] = Field(
        default_factory=list, description="List of products that have this material"
    )
    images: list[ImageRead] = Field(default_factory=list, description="List of images for the material")
    files: list[FileRead] = Field(default_factory=list, description="List of files for the material")


## Update Schemas ##
class MaterialUpdate(BaseUpdateSchema):
    """Schema for a partial update of a material."""

    name: SingleLineUserText | None = Field(default=None, min_length=2, max_length=100)
    description: MultilineUserText | None = Field(default=None, max_length=500)
    source: SingleLineUserText | None = Field(
        default=None, max_length=50, description="Source of the material data, e.g. URL, IRI or citation key"
    )
    density_kg_m3: float | None = Field(default=None, gt=0, description="Volumetric density (kg/m³) ")
    is_crm: bool | None = Field(default=None, description="Is this material a Critical Raw Material (CRM)?")


### ProductType Schemas ###
## Create Schemas ##
class ProductTypeCreateWithCategories(BaseCreateSchema, ProductTypeBase):
    """Schema for creating a product type with links to existing categories."""

    category_ids: set[int] = Field(default_factory=set)


## Read Schemas ##
class ProductTypeRead(IntIdReadSchema, ProductTypeFields):
    """Schema for reading flat product type information."""


class ProductTypeReadWithRelationships(ProductTypeRead):
    """Schema for reading product type information with all relationships."""

    categories: list[CategoryRead] = Field(default_factory=list)
    images: list[ImageRead] = Field(default_factory=list)
    files: list[FileRead] = Field(default_factory=list)


## Update Schemas ##
class ProductTypeUpdate(BaseUpdateSchema):
    """Schema for a partial update of a product type."""

    name: SingleLineUserText | None = Field(default=None, min_length=2, max_length=100)
    description: MultilineUserText | None = Field(default=None, max_length=500)
