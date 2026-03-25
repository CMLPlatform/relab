"""Custom exceptions for data collection CRUD and router flows."""

from app.api.common.exceptions import BadRequestError, ConflictError, NotFoundError


class ProductPropertyNotFoundError(NotFoundError):
    """Raised when a product is missing a requested one-to-one property object."""

    def __init__(self, property_label: str, product_id: int | None) -> None:
        super().__init__(f"{property_label} for product with id {product_id} not found")


class ProductPropertyAlreadyExistsError(ConflictError):
    """Raised when attempting to create a one-to-one property that already exists."""

    def __init__(self, product_id: int, property_label: str) -> None:
        super().__init__(f"Product with id {product_id} already has {property_label}")


class InvalidProductTreeError(BadRequestError):
    """Raised when a product/component tree payload is structurally invalid."""


class ProductTreeMissingContentError(InvalidProductTreeError):
    """Raised when a product tree has neither materials nor components."""

    def __init__(self) -> None:
        super().__init__("Product needs materials or components")


class ProductOwnerRequiredError(InvalidProductTreeError):
    """Raised when product tree creation is attempted without an owner."""

    def __init__(self) -> None:
        super().__init__("Product owner_id must be set before creating a product or component.")


class MaterialIDRequiredError(BadRequestError):
    """Raised when a nested material operation requires an explicit material id."""

    def __init__(self) -> None:
        super().__init__("Material ID is required for this operation")
