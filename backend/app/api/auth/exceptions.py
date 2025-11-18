"""Custom exceptions for user and organization operations."""

from fastapi import status
from pydantic import UUID4

from app.api.common.exceptions import APIError
from app.api.common.models.custom_types import IDT, MT


class AuthCRUDError(APIError):
    """Base class for custom authentication CRUD exceptions."""


class UserNameAlreadyExistsError(AuthCRUDError):
    """Raised when a username is already taken."""

    http_status_code = status.HTTP_409_CONFLICT

    def __init__(self, username: str):
        msg = f"Username '{username}' is already taken."
        super().__init__(msg)


class AlreadyMemberError(AuthCRUDError):
    """Raised when a user already belongs to an organization."""

    http_status_code = status.HTTP_409_CONFLICT

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (
            f"User with ID {user_id} already belongs to an organization"
            if user_id
            else "You already belong to an organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class UserOwnsOrgError(AuthCRUDError):
    """Raised when a user already owns an organization."""

    http_status_code = status.HTTP_409_CONFLICT

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (f"User with ID {user_id} owns an organization" if user_id else "You own an organization") + (
            f": {details}" if details else ""
        )

        super().__init__(msg)


class UserHasNoOrgError(AuthCRUDError):
    """Raised when a user does not belong to any organization."""

    http_status_code = status.HTTP_404_NOT_FOUND

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (
            f"User with ID {user_id} does not belong to an organization"
            if user_id
            else "You do not belong to an organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class UserIsNotMemberError(AuthCRUDError):
    """Raised when a user does not belong to an organization."""

    http_status_code = status.HTTP_403_FORBIDDEN

    def __init__(
        self, user_id: UUID4 | None = None, organization_id: UUID4 | None = None, details: str | None = None
    ) -> None:
        msg = (
            f"User with ID {user_id} does not belong to the organization with ID {organization_id}"
            if user_id
            else "You do not belong to this organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class UserDoesNotOwnOrgError(AuthCRUDError):
    """Raised when a user does not own an organization."""

    http_status_code = status.HTTP_403_FORBIDDEN

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (
            f"User with ID {user_id} does not own an organization" if user_id else "You do not own an organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class OrganizationHasMembersError(AuthCRUDError):
    """Raised when an organization has members and cannot be deleted."""

    http_status_code = status.HTTP_409_CONFLICT

    def __init__(self, organization_id: UUID4 | None = None) -> None:
        msg = (
            f"Organization {' with ID ' + str(organization_id) if organization_id else ''}"
            " has members and cannot be deleted. Transfer ownership or remove members first."
        )

        super().__init__(msg)


class OrganizationNameExistsError(AuthCRUDError):
    """Raised when an organization with the same name already exists."""

    http_status_code = status.HTTP_409_CONFLICT

    def __init__(self, msg: str = "Organization with this name already exists") -> None:
        super().__init__(msg)


class UserOwnershipError(APIError):
    """Exception raised when a user does not own the specified model."""

    http_status_code = status.HTTP_403_FORBIDDEN

    def __init__(
        self,
        model_type: type[MT],
        model_id: IDT,
        user_id: UUID4,
    ) -> None:
        model_name = model_type.get_api_model_name().name_capital
        super().__init__(message=(f"User {user_id} does not own {model_name} with ID {model_id}."))


class DisposableEmailError(AuthCRUDError):
    """Raised when a disposable email address is used."""

    http_status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, email: str) -> None:
        msg = f"The email address '{email}' is from a disposable email provider, which is not allowed."
        super().__init__(msg)
