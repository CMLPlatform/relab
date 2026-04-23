"""Custom exceptions for data collection CRUD and router flows."""

from app.api.common.exceptions import BadRequestError


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
