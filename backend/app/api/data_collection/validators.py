"""Business validation for product hierarchy and bill of materials.

Extracted from Product.validate_product model_validator per ADR-013.
These validators should be called from the CRUD layer during create/update,
not from the ORM model itself.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.api.data_collection.models.product import Product

ERR_PRODUCT_CYCLE = "Cycle detected: a product cannot contain itself directly or indirectly."
ERR_BASE_PRODUCT_EMPTY = "A product must have at least one material or one component."
ERR_BASE_PRODUCT_AMOUNT = "Base product must have amount_in_parent set to None."
ERR_INTERMEDIATE_PRODUCT_AMOUNT = "Intermediate product must have amount_in_parent set."
ERR_INTERMEDIATE_PRODUCT_EMPTY = "Intermediate product must have at least one material or one component."
ERR_LEAF_COMPONENTS_WITHOUT_MATERIALS = "All leaf components must have a non-empty bill of materials."


class ProductValidationError(ValueError):
    """Business-rule validation failure safe to return to API clients."""

    def __init__(self, public_message: str) -> None:
        self.public_message = public_message
        super().__init__(public_message)


def validate_product(product: Product) -> Product:
    """Validate the product hierarchy and bill of materials constraints.

    Raises:
        ValueError: If the product fails any business rule.
    """
    components = product.components
    bill_of_materials = product.bill_of_materials
    amount_in_parent = product.amount_in_parent

    if product.has_cycles():
        raise ProductValidationError(ERR_PRODUCT_CYCLE)

    if product.is_base_product:
        if not components and not bill_of_materials:
            raise ProductValidationError(ERR_BASE_PRODUCT_EMPTY)
        if amount_in_parent is not None:
            raise ProductValidationError(ERR_BASE_PRODUCT_AMOUNT)

    else:
        # Intermediate product
        if amount_in_parent is None:
            raise ProductValidationError(ERR_INTERMEDIATE_PRODUCT_AMOUNT)
        if not components and not bill_of_materials:
            raise ProductValidationError(ERR_INTERMEDIATE_PRODUCT_EMPTY)

    # Ensure all components ultimately resolve to materials
    if not product.components_resolve_to_materials():
        raise ProductValidationError(ERR_LEAF_COMPONENTS_WITHOUT_MATERIALS)

    return product
