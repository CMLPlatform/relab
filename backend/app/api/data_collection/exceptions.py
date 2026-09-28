"""Custom exceptions for data collection CRUD and router flows."""

from app.api.common.exceptions import BadRequestError, PreconditionFailedError


class InvalidProductTreeError(BadRequestError):
    """Raised when a product/component tree payload is structurally invalid."""


class ProductOwnerRequiredError(InvalidProductTreeError):
    """Raised when product tree creation is attempted without an owner."""

    def __init__(self) -> None:
        super().__init__("Product owner_id must be set before creating a product or component.")


class ProductTreeTooDeepError(InvalidProductTreeError):
    """Raised when a create would nest components deeper than the tree depth limit."""

    def __init__(self, max_depth: int) -> None:
        super().__init__(f"Components can be nested at most {max_depth} levels below a product.")


class ProductExportTooLargeError(BadRequestError):
    """Raised when an export's component trees are too deep or too large to build in one request."""

    def __init__(self, max_depth: int, max_components: int) -> None:
        super().__init__(
            f"This export is too large: a product has components nested more than {max_depth} levels deep, "
            f"or the export has more than {max_components:,} components. "
            "Narrow the filters or use the dataset release."
        )


class MaterialIDRequiredError(BadRequestError):
    """Raised when a nested material operation requires an explicit material id."""

    def __init__(self) -> None:
        super().__init__("Material ID is required for this operation")


class ProductVersionMismatchError(PreconditionFailedError):
    """Raised when a product changed since the client last read it."""

    def __init__(self) -> None:
        super().__init__("This product was changed since you loaded it. Reload it and apply your edits again.")
