"""Custom exceptions for authentication, user, and organization operations."""

from fastapi import HTTPException, status
from fastapi_users.router.common import ErrorCode
from pydantic import UUID4
from sqlalchemy.exc import IntegrityError

from app.api.common.exceptions import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    UnauthorizedError,
)
from app.api.common.models.base import get_model_label
from app.api.common.models.custom_types import IDT, MT


class AuthCRUDError(Exception):
    """Base class for custom authentication CRUD exceptions."""


class UserNameAlreadyExistsError(ConflictError, AuthCRUDError):
    """Raised when a username is already taken."""

    def __init__(self, username: str):
        msg = f"Username '{username}' is already taken."
        super().__init__(msg)


class AlreadyMemberError(ConflictError, AuthCRUDError):
    """Raised when a user already belongs to an organization."""

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (
            f"User with ID {user_id} already belongs to an organization"
            if user_id
            else "You already belong to an organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class UserOwnsOrgError(ConflictError, AuthCRUDError):
    """Raised when a user already owns an organization."""

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (f"User with ID {user_id} owns an organization" if user_id else "You own an organization") + (
            f": {details}" if details else ""
        )

        super().__init__(msg)


class UserHasNoOrgError(NotFoundError, AuthCRUDError):
    """Raised when a user does not belong to any organization."""

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (
            f"User with ID {user_id} does not belong to an organization"
            if user_id
            else "You do not belong to an organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class UserIsNotMemberError(ForbiddenError, AuthCRUDError):
    """Raised when a user does not belong to an organization."""

    def __init__(
        self, user_id: UUID4 | None = None, organization_id: UUID4 | None = None, details: str | None = None
    ) -> None:
        msg = (
            f"User with ID {user_id} does not belong to the organization with ID {organization_id}"
            if user_id
            else "You do not belong to this organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class UserDoesNotOwnOrgError(ForbiddenError, AuthCRUDError):
    """Raised when a user does not own an organization."""

    def __init__(self, user_id: UUID4 | None = None, details: str | None = None) -> None:
        msg = (
            f"User with ID {user_id} does not own an organization" if user_id else "You do not own an organization"
        ) + (f": {details}" if details else "")
        super().__init__(msg)


class OrganizationHasMembersError(ConflictError, AuthCRUDError):
    """Raised when an organization has members and cannot be deleted."""

    def __init__(self, organization_id: UUID4 | None = None) -> None:
        msg = (
            f"Organization {' with ID ' + str(organization_id) if organization_id else ''}"
            " has members and cannot be deleted. Transfer ownership or remove members first."
        )

        super().__init__(msg)


class OrganizationNameExistsError(ConflictError, AuthCRUDError):
    """Raised when an organization with the same name already exists."""

    def __init__(self, msg: str = "Organization with this name already exists") -> None:
        super().__init__(msg)


class UserOwnershipError(ForbiddenError):
    """Exception raised when a user does not own the specified model."""

    def __init__(
        self,
        model_type: type[MT],
        model_id: IDT,
        user_id: UUID4,
    ) -> None:
        model_name = get_model_label(model_type)
        super().__init__(message=(f"User {user_id} does not own {model_name} with ID {model_id}."))


class DisposableEmailError(BadRequestError, AuthCRUDError):
    """Raised when a disposable email address is used."""

    def __init__(self, email: str) -> None:  # noqa: ARG002
        msg = "Disposable email providers are not allowed."
        super().__init__(msg)


class InvalidOAuthProviderError(BadRequestError):
    """Raised when an unsupported OAuth provider is requested."""

    def __init__(self, provider: str) -> None:
        super().__init__(f"Invalid OAuth provider: {provider}.")


class OAuthAccountNotLinkedError(NotFoundError):
    """Raised when the current user has no linked OAuth account for the provider."""

    def __init__(self, provider: str) -> None:
        super().__init__(f"OAuth account not linked for provider: {provider}.")


class RefreshTokenError(UnauthorizedError):
    """Base class for refresh token authentication failures."""


class RefreshTokenNotFoundError(RefreshTokenError):
    """Raised when no refresh token is present in the request."""

    def __init__(self) -> None:
        super().__init__("Refresh token not found")


class RefreshTokenInvalidError(RefreshTokenError):
    """Raised when a refresh token is invalid or expired."""

    def __init__(self) -> None:
        super().__init__("Invalid or expired refresh token")


class RefreshTokenRevokedError(RefreshTokenError):
    """Raised when a refresh token has already been revoked."""

    def __init__(self) -> None:
        super().__init__("Token has been revoked")


class RefreshTokenUserInactiveError(RefreshTokenError):
    """Raised when the refresh token resolves to a missing or inactive user."""

    def __init__(self) -> None:
        super().__init__("User not found or inactive")


class OAuthHTTPError(HTTPException):
    """Base class for OAuth flow errors that intentionally preserve FastAPI HTTPException payloads."""

    def __init__(self, detail: str | ErrorCode, status_code: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(status_code=status_code, detail=detail)


class OAuthStateDecodeError(OAuthHTTPError):
    """Raised when an OAuth state token cannot be decoded."""

    def __init__(self) -> None:
        super().__init__(ErrorCode.ACCESS_TOKEN_DECODE_ERROR)


class OAuthStateExpiredError(OAuthHTTPError):
    """Raised when an OAuth state token has expired."""

    def __init__(self) -> None:
        super().__init__(ErrorCode.ACCESS_TOKEN_ALREADY_EXPIRED)


class OAuthInvalidStateError(OAuthHTTPError):
    """Raised when OAuth CSRF state validation fails."""

    def __init__(self) -> None:
        super().__init__(ErrorCode.OAUTH_INVALID_STATE)


class OAuthInvalidRedirectURIError(OAuthHTTPError):
    """Raised when a frontend OAuth redirect URI is not allowlisted."""

    def __init__(self) -> None:
        super().__init__("Invalid redirect_uri")


class OAuthEmailUnavailableError(OAuthHTTPError):
    """Raised when the OAuth provider does not return an email address."""

    def __init__(self) -> None:
        super().__init__(ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL)


class OAuthUserAlreadyExistsHTTPError(OAuthHTTPError):
    """Raised when an OAuth login collides with an existing unlinked user."""

    def __init__(self) -> None:
        super().__init__(ErrorCode.OAUTH_USER_ALREADY_EXISTS)


class OAuthInactiveUserHTTPError(OAuthHTTPError):
    """Raised when an OAuth-authenticated user is inactive."""

    def __init__(self) -> None:
        super().__init__(ErrorCode.LOGIN_BAD_CREDENTIALS)


class OAuthAccountAlreadyLinkedError(OAuthHTTPError):
    """Raised when an OAuth provider account is already linked to another user."""

    def __init__(self) -> None:
        super().__init__("This account is already linked to another user.")


class RegistrationHTTPError(HTTPException):
    """Base class for registration-route HTTP errors with stable string details."""

    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(status_code=status_code, detail=detail)


class RegistrationUserAlreadyExistsHTTPError(RegistrationHTTPError):
    """Raised when a registration email is already in use."""

    def __init__(self) -> None:
        super().__init__(detail="A user with this email already exists", status_code=status.HTTP_409_CONFLICT)


class RegistrationInvalidPasswordHTTPError(RegistrationHTTPError):
    """Raised when password validation fails during registration."""

    def __init__(self, reason: str) -> None:
        super().__init__(
            detail=f"Password validation failed: {reason}",
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class RegistrationUnexpectedHTTPError(RegistrationHTTPError):
    """Raised when an unexpected registration failure occurs."""

    def __init__(self) -> None:
        super().__init__(
            detail="An unexpected error occurred during registration",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


UNIQUE_VIOLATION_PG_CODE = "23505"


def handle_organization_integrity_error(e: IntegrityError, action: str) -> None:
    """Handle integrity errors when creating or updating an organization, and raise appropriate exceptions."""
    if getattr(e.orig, "pgcode", None) == UNIQUE_VIOLATION_PG_CODE:
        raise OrganizationNameExistsError from e
    err_msg = f"Error {action} organization: {e}"
    raise InternalServerError(details=err_msg, log_message=err_msg) from e
