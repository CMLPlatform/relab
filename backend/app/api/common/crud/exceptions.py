"""Custom exceptions for CRUD operations."""

from typing import TYPE_CHECKING

from app.api.common.exceptions import BadRequestError, ConflictError, InternalServerError, NotFoundError
from app.api.common.models.base import get_model_label, get_model_label_plural
from app.api.common.models.custom_types import IDT, MT

if TYPE_CHECKING:
    from collections.abc import Iterable


class ModelNotFoundError(NotFoundError):
    """Exception raised when a model is not found in the database."""

    def __init__(self, model_type: type[MT] | None = None, model_id: IDT | None = None) -> None:
        self.model_type = model_type
        self.model_id = model_id
        model_name = get_model_label(model_type)

        super().__init__(
            message=f"{model_name} {f'with id {model_id}' if model_id else ''} not found",
        )


class DependentModelOwnershipError(BadRequestError):
    """Exception raised when a dependent model does not belong to the specified parent model."""

    def __init__(
        self,
        dependent_model: type[MT],
        dependent_id: IDT,
        parent_model: type[MT],
        parent_id: IDT,
    ) -> None:
        dependent_model_name = get_model_label(dependent_model)
        parent_model_name = get_model_label(parent_model)

        super().__init__(
            message=(
                f"{dependent_model_name} with ID {dependent_id} does not belong to "
                f"{parent_model_name} with ID {parent_id}."
            )
        )


class CRUDConfigurationError(InternalServerError):
    """Exception raised when shared CRUD helpers are misconfigured for a model."""

    def __init__(self, message: str) -> None:
        super().__init__(message=message, log_message=message)


class ModelsNotFoundError(NotFoundError):
    """Exception raised when one or more requested models do not exist."""

    def __init__(self, model_type: type[MT], missing_ids: Iterable[IDT]) -> None:
        model_name = get_model_label_plural(model_type)
        formatted_ids = ", ".join(map(str, sorted(missing_ids)))
        super().__init__(message=f"The following {model_name} do not exist: {formatted_ids}")


class NoLinkedItemsError(BadRequestError):
    """Exception raised when a parent model has no linked items to operate on."""

    def __init__(self, model_name_plural: str) -> None:
        super().__init__(message=f"No {model_name_plural.lower()} are assigned")


class LinkedItemsAlreadyAssignedError(ConflictError):
    """Exception raised when attempting to add already-linked items."""

    def __init__(self, model_name_plural: str, duplicate_ids: Iterable[IDT]) -> None:
        formatted_ids = ", ".join(map(str, sorted(duplicate_ids)))
        super().__init__(message=f"{model_name_plural} with id {formatted_ids} are already assigned")


class LinkedItemsMissingError(NotFoundError):
    """Exception raised when expected linked items are missing."""

    def __init__(self, model_name_plural: str, missing_ids: Iterable[IDT]) -> None:
        formatted_ids = ", ".join(map(str, sorted(missing_ids)))
        super().__init__(message=f"{model_name_plural} with id {formatted_ids} not found")
