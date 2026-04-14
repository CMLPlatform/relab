"""CRUD operations for the models related to data collection."""

from app.api.common.crud.associations import get_linking_model_with_ids_if_it_exists
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.utils import get_models_by_ids_or_404
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
    "add_material_to_product",
    "add_materials_to_product",
    "create_component",
    "create_product",
    "delete_product",
    "get_linking_model_with_ids_if_it_exists",
    "get_model_by_id",
    "get_models_by_ids_or_404",
    "get_product_trees",
    "PRODUCT_READ_DETAIL_RELATIONSHIPS",
    "PRODUCT_READ_SUMMARY_RELATIONSHIPS",
    "product_files_crud",
    "product_images_crud",
    "remove_materials_from_product",
    "update_material_within_product",
    "update_product",
]
