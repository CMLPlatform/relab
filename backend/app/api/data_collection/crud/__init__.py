"""CRUD operations for the models related to data collection."""

from app.api.common.crud.associations import get_linking_model_with_ids_if_it_exists
from app.api.common.crud.base import get_model_by_id
from app.api.common.crud.utils import get_models_by_ids_or_404

from .material_links import (
    add_material_to_product,
    add_materials_to_product,
    remove_materials_from_product,
    update_material_within_product,
)
from .products import create_component, create_product, delete_product, get_product_trees, update_product
from .properties import (
    create_circularity_properties,
    create_physical_properties,
    delete_circularity_properties,
    delete_physical_properties,
    get_circularity_properties,
    get_physical_properties,
    update_circularity_properties,
    update_physical_properties,
)
from .storage import product_files_crud, product_images_crud

__all__ = [
    "add_material_to_product",
    "add_materials_to_product",
    "create_circularity_properties",
    "create_component",
    "create_physical_properties",
    "create_product",
    "delete_circularity_properties",
    "delete_physical_properties",
    "delete_product",
    "get_circularity_properties",
    "get_linking_model_with_ids_if_it_exists",
    "get_model_by_id",
    "get_models_by_ids_or_404",
    "get_physical_properties",
    "get_product_trees",
    "product_files_crud",
    "product_images_crud",
    "remove_materials_from_product",
    "update_circularity_properties",
    "update_material_within_product",
    "update_physical_properties",
    "update_product",
]
