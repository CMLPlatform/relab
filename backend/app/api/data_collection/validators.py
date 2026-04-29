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
ERR_PRODUCT_EMPTY = "A product must have at least one material or one component."
ERR_LEAF_COMPONENTS_WITHOUT_MATERIALS = "All leaf components must have a non-empty bill of materials."


class ProductValidationError(ValueError):
    """Business-rule validation failure safe to return to API clients."""

    def __init__(self, public_message: str) -> None:
        self.public_message = public_message
        super().__init__(public_message)


def validate_product(product: Product) -> Product:
    """Validate the product hierarchy and bill of materials constraints.

    DB-level invariants enforce the role-specific shape of a row
    (``parent_id``/``owner_id``/``amount_in_parent`` combinations), so this
    validator only covers structural rules that span multiple rows.

    Raises:
        ProductValidationError: If the tree fails any structural business rule.
    """
    if product.has_cycles():
        raise ProductValidationError(ERR_PRODUCT_CYCLE)

    if not product.components and not product.bill_of_materials:
        raise ProductValidationError(ERR_PRODUCT_EMPTY)

    if not product.components_resolve_to_materials():
        raise ProductValidationError(ERR_LEAF_COMPONENTS_WITHOUT_MATERIALS)

    return product
