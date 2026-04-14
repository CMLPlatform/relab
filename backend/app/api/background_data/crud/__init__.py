"""CRUD operations for the background data models."""

from app.api.common.crud.associations import add_links
from app.api.common.crud.query import require_model, require_models

from .categories import (
    create_category,
    delete_category,
    get_category_trees,
    update_category,
    validate_category_creation,
    validate_category_taxonomy_domains,
)
from .materials import (
    add_categories_to_material,
    add_category_to_material,
    create_material,
    delete_material,
    material_files_crud,
    material_images_crud,
    remove_categories_from_material,
    update_material,
)
from .product_types import (
    add_categories_to_product_type,
    add_category_to_product_type,
    create_product_type,
    delete_product_type,
    product_type_files_crud,
    product_type_images_crud,
    remove_categories_from_product_type,
    update_product_type,
)
from .taxonomies import create_taxonomy, delete_taxonomy, update_taxonomy

__all__ = [
    "add_categories_to_material",
    "add_categories_to_product_type",
    "add_category_to_material",
    "add_category_to_product_type",
    "add_links",
    "create_category",
    "create_material",
    "create_product_type",
    "create_taxonomy",
    "delete_category",
    "delete_material",
    "delete_product_type",
    "delete_taxonomy",
    "get_category_trees",
    "material_files_crud",
    "material_images_crud",
    "product_type_files_crud",
    "product_type_images_crud",
    "remove_categories_from_material",
    "remove_categories_from_product_type",
    "require_model",
    "require_models",
    "update_category",
    "update_material",
    "update_product_type",
    "update_taxonomy",
    "validate_category_creation",
    "validate_category_taxonomy_domains",
]
