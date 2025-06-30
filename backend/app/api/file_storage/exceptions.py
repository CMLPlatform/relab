"""Custom exceptions for file storage database models."""

from fastapi import status

from app.api.common.exceptions import APIError
from app.api.common.models.custom_types import IDT, MT


class FastAPIStorageFileNotFoundError(APIError):
    """Custom error for file not found in storage."""

    http_status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, filename: str, details: str | None = None) -> None:
        super().__init__(message=f"File not found in storage: {filename}.", details=details)


class ModelFileNotFoundError(APIError):
    """Exception raised when a file of a database model is not found in the local storage."""

    http_status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(
        self, model_type: type[MT] | None = None, model_id: IDT | None = None, details: str | None = None
    ) -> None:
        super().__init__(
            message=f"File for {model_type.get_api_model_name().name_capital if model_type else 'Model'}"
            f"{f'with id {model_id}'} not found.",
            details=details,
        )
