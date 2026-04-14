"""CRUD operations for the models related to data collection."""

from app.api.common.crud.associations import require_link
from app.api.common.crud.query import require_model, require_models
from app.api.data_collection.crud.products import (
    PRODUCT_READ_DETAIL_RELATIONSHIPS,
    PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    create_component,
    create_product,
    delete_product,
    get_product_trees,
    update_product,
)
from app.api.data_collection.crud.storage import product_files_crud, product_images_crud

from .material_links import (
    add_material_to_product,
    add_materials_to_product,
    remove_materials_from_product,
    update_material_within_product,
)

__all__ = [
    "PRODUCT_READ_DETAIL_RELATIONSHIPS",
    "PRODUCT_READ_SUMMARY_RELATIONSHIPS",
    "add_material_to_product",
    "add_materials_to_product",
    "create_component",
    "create_product",
    "delete_product",
    "get_product_trees",
    "product_files_crud",
    "product_images_crud",
    "remove_materials_from_product",
    "require_link",
    "require_model",
    "require_models",
    "update_material_within_product",
    "update_product",
]
