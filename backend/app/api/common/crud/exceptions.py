"""Custom exceptions for CRUD operations."""

from fastapi import status

from app.api.common.exceptions import APIError
from app.api.common.models.custom_types import IDT, MT


class ModelNotFoundError(APIError):
    """Exception raised when a model is not found in the database."""

    http_status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, model_type: type[MT] | None = None, model_id: IDT | None = None) -> None:
        self.model_type = model_type
        self.model_id = model_id
        model_name = model_type.get_api_model_name().name_capital if model_type else "Model"

        super().__init__(
            message=f"{model_name} {f'with id {model_id}' if model_id else ''} not found",
        )


class DependentModelOwnershipError(APIError):
    """Exception raised when a dependent model does not belong to the specified parent model."""

    http_status_code = status.HTTP_400_BAD_REQUEST

    def __init__(
        self,
        dependent_model: type[MT],
        dependent_id: IDT,
        parent_model: type[MT],
        parent_id: IDT,
    ) -> None:
        dependent_model_name = dependent_model.get_api_model_name().name_capital
        parent_model_name = parent_model.get_api_model_name().name_capital

        super().__init__(
            message=(
                f"{dependent_model_name} with ID {dependent_id} does not belong to "
                f"{parent_model_name} with ID {parent_id}."
            )
        )
