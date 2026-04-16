"""Explicit domain entrypoints for product reads and mutations."""

from app.api.data_collection.crud.product_commands import (
    apply_product_update,
    create_and_persist_product_tree,
    create_component,
    create_product,
    create_product_bill_of_materials,
    create_product_components,
    create_product_record,
    create_product_tree,
    create_product_videos,
    delete_product,
    delete_product_media,
    get_owned_component,
    product_payload,
    update_product,
    validate_product_type,
)
from app.api.data_collection.crud.product_tree_queries import (
    PRODUCT_READ_DETAIL_RELATIONSHIPS,
    PRODUCT_READ_SUMMARY_RELATIONSHIPS,
    ProductTreeData,
    get_product_trees,
    load_product_tree_data,
)

__all__ = [
    "PRODUCT_READ_DETAIL_RELATIONSHIPS",
    "PRODUCT_READ_SUMMARY_RELATIONSHIPS",
    "ProductTreeData",
    "apply_product_update",
    "create_and_persist_product_tree",
    "create_component",
    "create_product",
    "create_product_bill_of_materials",
    "create_product_components",
    "create_product_record",
    "create_product_tree",
    "create_product_videos",
    "delete_product",
    "delete_product_media",
    "get_owned_component",
    "get_product_trees",
    "load_product_tree_data",
    "product_payload",
    "update_product",
    "validate_product_type",
]
