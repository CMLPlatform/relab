"""Business validation for product hierarchy and bill of materials.

Extracted from Product.validate_product model_validator per ADR-013.
These validators should be called from the CRUD layer during create/update,
not from the ORM model itself.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.api.data_collection.models.product import Product


def validate_product(product: Product) -> Product:
    """Validate the product hierarchy and bill of materials constraints.

    Raises:
        ValueError: If the product fails any business rule.
    """
    components = product.components
    bill_of_materials = product.bill_of_materials
    amount_in_parent = product.amount_in_parent

    if product.has_cycles():
        err_msg = "Cycle detected: a product cannot contain itself directly or indirectly."
        raise ValueError(err_msg)

    if product.is_base_product:
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
    if not product.components_resolve_to_materials():
        err_msg = "All leaf components must have a non-empty bill of materials."
        raise ValueError(err_msg)

    return product
