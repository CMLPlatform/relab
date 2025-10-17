"""Pydantic models used to validate CRUD operations for background data."""

from pydantic import ConfigDict, Field, PositiveInt

from app.api.background_data.models import (
    CategoryBase,
    MaterialBase,
    ProductTypeBase,
    TaxonomyBase,
    TaxonomyDomain,
)
from app.api.common.schemas.associations import MaterialProductLinkReadWithinMaterial
from app.api.common.schemas.base import (
    BaseCreateSchema,
    BaseReadSchema,
    BaseUpdateSchema,
    MaterialRead,
    ProductRead,
)
from app.api.file_storage.schemas import FileRead, ImageRead


### Category Schemas ###
## Create Schemas ##
class CategoryCreate(BaseCreateSchema, CategoryBase):
    """Schema for creating a new category without subcategories."""

    taxonomy_id: PositiveInt | None = None
    supercategory_id: PositiveInt | None = None


class CategoryCreateWithinCategoryWithSubCategories(BaseCreateSchema, CategoryBase):
    """Schema for creating a new category within a category, with optional subcategories."""

    # Database model has a None default, but Pydantic model has empty set default for consistent API type handling
    subcategories: set["CategoryCreateWithinCategoryWithSubCategories"] = Field(
        default_factory=set,
        description="List of subcategories",
    )


# Rebuild schema to allow for nested subcategories
CategoryCreateWithinCategoryWithSubCategories.model_rebuild()


class CategoryCreateWithinTaxonomyWithSubCategories(CategoryCreateWithinCategoryWithSubCategories):
    """Schema for creating a new category within a taxonomy, with optional subcategories."""

    supercategory_id: PositiveInt | None = None


class CategoryCreateWithSubCategories(CategoryCreateWithinTaxonomyWithSubCategories):
    """Schema for creating a new category, with optional subcategories."""

    taxonomy_id: PositiveInt | None = None


## Read Schemas ##
class CategoryReadAsSubCategory(BaseReadSchema, CategoryBase):
    """Schema for reading subcategory information."""

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        json_schema_extra={
            "examples": [
                {
                    "id": 2,
                    "name": "Ferrous metals",
                    "description": "Iron and its alloys",
                }
            ]
        }
    )


class CategoryRead(CategoryReadAsSubCategory):
    """Schema for reading flat category information."""

    taxonomy_id: PositiveInt = Field(description="ID of the taxonomy")
    supercategory_id: PositiveInt | None = None

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see
        json_schema_extra={
            "examples": [
                {
                    "id": 2,
                    "name": "Ferrous metals",
                    "description": "Iron and its alloys",
                    "taxonomy_id": 1,
                    "supercategory_id": 1,
                }
            ]
        }
    )


class CategoryReadWithRelationships(CategoryRead):
    """Schema for reading category information with all relationships."""

    materials: list[MaterialRead] = Field(default_factory=list, description="List of materials linked to the category")
    product_types: list["ProductTypeRead"] = Field(
        default_factory=list, description="List of product types linked to the category"
    )


class CategoryReadWithRelationshipsAndFlatSubCategories(CategoryReadWithRelationships):
    """Schema for reading category information with flat (one level deep) subcategories."""

    subcategories: list[CategoryReadAsSubCategory] = Field(default_factory=list, description="List of subcategories")


class CategoryReadAsSubCategoryWithRecursiveSubCategories(CategoryReadAsSubCategory):
    """Schema for reading category information with recursive subcategories."""

    subcategories: list["CategoryReadAsSubCategoryWithRecursiveSubCategories"] = Field(
        default_factory=list, description="List of subcategories"
    )

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        json_schema_extra={
            "examples": [
                {
                    "id": 1,
                    "name": "Metals",
                    "description": "All kinds of metals",
                    "subcategories": [
                        {
                            "id": 2,
                            "name": "Ferrous metals",
                            "description": "Iron and its alloys",
                            "subcategories": [
                                {
                                    "id": 3,
                                    "name": "Steel",
                                    "description": "Steel alloys",
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )


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

    name: str | None = Field(default=None, min_length=2, max_length=100, description="Name of the category")
    description: str | None = Field(default=None, max_length=500, description="Description of the category")

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "name": "Metals",
                        "description": "All kinds of metals",
                    }
                ]
            }
        }
    )


### Taxonomy Schemas ###
## Create Schemas ##
class TaxonomyCreate(BaseCreateSchema, TaxonomyBase):
    """Schema for creating a new taxonomy without categories."""


class TaxonomyCreateWithCategories(BaseCreateSchema, TaxonomyBase):
    """Schema for creating a new taxonomy, optionally with new categories."""

    categories: set[CategoryCreateWithinTaxonomyWithSubCategories] = Field(
        default_factory=set, description="Set of subcategories"
    )


## Read Schemas ##
class TaxonomyRead(BaseReadSchema, TaxonomyBase):
    """Schema for reading minimal taxonomy information."""

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "name": "Materials Taxonomy",
                        "description": "Taxonomy for materials",
                        "domain": "materials",
                        "source": "DOI:10.2345/12345",
                    }
                ]
            }
        }
    )


class TaxonomyReadWithCategoryTree(TaxonomyRead):
    """Schema for reading taxonomy information with a tree of categories."""

    categories: set[CategoryReadWithRecursiveSubCategories] = Field(
        default_factory=set, description="Set of categories in the taxonomy"
    )

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "name": "Materials Taxonomy",
                        "description": "Taxonomy for materials",
                        "domain": "materials",
                        "source": "DOI:10.2345/12345",
                        "categories": [
                            {
                                "id": 1,
                                "name": "Metals",
                                "description": "All kinds of metals",
                                "subcategories": [
                                    {
                                        "name": "Ferrous metals",
                                        "description": "Iron and its alloys",
                                        "subcategories": [{"name": "Steel", "description": "Steel alloys"}],
                                    }
                                ],
                            }
                        ],
                    }
                ]
            }
        }
    )


class TaxonomyUpdate(BaseUpdateSchema):
    """Schema for the partial update of a taxonomy."""

    name: str | None = Field(default=None, min_length=2, max_length=50)
    version: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] | None = Field(
        description="Domains of the taxonomy, e.g. {" + f"{', '.join([d.value for d in TaxonomyDomain][:3])}" + "}"
    )

    source: str | None = Field(default=None, max_length=50, description="Source of the taxonomy data")


### Material Schemas ###
## Create Schemas ##
class MaterialCreate(BaseCreateSchema, MaterialBase):
    """Schema for creating a material."""


class MaterialCreateWithCategories(BaseCreateSchema, MaterialBase):
    """Schema for creating a material with links to existing categories."""

    category_ids: set[int] = Field(default_factory=set, description="List of category IDs")


## Read Schemas ##
# Note that MaterialRead is defined in the common module to avoid circular imports


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

    name: str | None = Field(default=None, min_length=2, max_length=100, description="Name of the Material")
    description: str | None = Field(default=None, max_length=500, description="Description of the Material")
    source: str | None = Field(
        default=None,
        max_length=50,
        description="Source of the material data, e.g. URL, IRI or citation key",
    )
    density_kg_m3: float | None = Field(default=None, gt=0, description="Volumetric density (kg/m³) ")
    is_crm: bool | None = Field(default=None, description="Is this material a Critical Raw Material (CRM)?")


### ProductType Schemas ###
## Create Schemas ##
class ProductTypeCreate(BaseCreateSchema, ProductTypeBase):
    """Schema for creating a product type."""


class ProductTypeCreateWithCategories(BaseCreateSchema, ProductTypeBase):
    """Schema for creating a product type with links to existing categories."""

    category_ids: set[int] = Field(default_factory=set, description="List of category IDs")


## Read Schemas ##
class ProductTypeRead(BaseReadSchema, ProductTypeBase):
    """Schema for reading flat product type information."""


class ProductTypeReadWithRelationships(ProductTypeRead):
    """Schema for reading product type information with all relationships."""

    products: list[ProductRead] = Field(
        default_factory=list, description="List of products that have this product type"
    )
    categories: list[CategoryRead] = Field(
        default_factory=list, description="List of categories linked to the product type"
    )
    images: list[ImageRead] = Field(default_factory=list, description="List of images for the product type")
    files: list[FileRead] = Field(default_factory=list, description="List of files for the product type")


## Update Schemas ##
class ProductTypeUpdate(BaseUpdateSchema):
    """Schema for a partial update of a product type."""

    name: str | None = Field(default=None, min_length=2, max_length=100, description="Name of the Product Type.")
    description: str | None = Field(default=None, max_length=500, description="Description of the Product Type.")
