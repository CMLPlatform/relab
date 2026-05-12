"""Manual audit validation for product hierarchy and bill of materials.

Progressive data entry intentionally allows incomplete product/component
records during collection. Use these validators from manual curation or audit
workflows when checking whether a product tree is complete enough for reuse.
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
    """Validate completed product hierarchy and bill-of-materials constraints.

    DB-level invariants enforce the role-specific shape of a row
    (``parent_id``/``owner_id``/``amount_in_parent`` combinations), so this
    validator only covers structural rules that span multiple rows. It is not
    called by normal create/update flows because those support draft records.

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
