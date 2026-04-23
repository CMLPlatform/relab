"""Tests for authentication exceptions module.

Tests validate exception hierarchy, HTTP status codes, message formatting,
and the handle_organization_integrity_error function.
"""

from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import status
from fastapi_users.router.common import ErrorCode
from sqlalchemy.exc import IntegrityError

from app.api.auth.exceptions import (
    AlreadyMemberError,
    AuthCRUDError,
    DisposableEmailError,
    InvalidOAuthProviderError,
    OAuthAccountAlreadyLinkedError,
    OAuthAccountNotLinkedError,
    OAuthEmailUnavailableError,
    OAuthInactiveUserHTTPError,
    OAuthInvalidRedirectURIError,
    OAuthInvalidStateError,
    OAuthStateDecodeError,
    OAuthStateExpiredError,
    OAuthUserAlreadyExistsHTTPError,
    OrganizationHasMembersError,
    OrganizationNameExistsError,
    RefreshTokenInvalidError,
    RefreshTokenNotFoundError,
    RefreshTokenRevokedError,
    RefreshTokenUserInactiveError,
    RegistrationInvalidPasswordHTTPError,
    RegistrationUnexpectedHTTPError,
    RegistrationUserAlreadyExistsHTTPError,
    UserDoesNotOwnOrgError,
    UserHasNoOrgError,
    UserIsNotMemberError,
    UserNameAlreadyExistsError,
    UserOwnershipError,
    UserOwnsOrgError,
    handle_organization_integrity_error,
)
from app.api.common.exceptions import APIError

_USER_ID = uuid4()
_ORG_ID = uuid4()


class TestAuthCRUDErrorHierarchy:
    """Test the exception class hierarchy."""

    def test_auth_crud_error_is_not_api_error(self) -> None:
        """Verify AuthCRUDError stays a marker mixin, while subclasses inherit APIError via concrete families."""
        assert not issubclass(AuthCRUDError, APIError)

    def test_user_ownership_error_is_api_error_not_auth_crud(self) -> None:
        """Verify UserOwnershipError inherits from APIError directly, not AuthCRUDError."""
        assert issubclass(UserOwnershipError, APIError)
        assert not issubclass(UserOwnershipError, AuthCRUDError)


@pytest.mark.parametrize(
    ("exception_cls", "kwargs", "expected_status", "expected_fragments"),
    [
        # UserNameAlreadyExistsError
        (
            UserNameAlreadyExistsError,
            {"username": "jean.dupont"},
            status.HTTP_409_CONFLICT,
            ["jean.dupont", "already taken"],
        ),
        # AlreadyMemberError -- personal vs admin phrasing
        (AlreadyMemberError, {}, status.HTTP_409_CONFLICT, ["You already belong"]),
        (AlreadyMemberError, {"user_id": _USER_ID}, status.HTTP_409_CONFLICT, [str(_USER_ID), "already belongs"]),
        (
            AlreadyMemberError,
            {"user_id": _USER_ID, "details": "Active member since Jan 2024"},
            status.HTTP_409_CONFLICT,
            [str(_USER_ID), "Active member"],
        ),
        # UserOwnsOrgError
        (UserOwnsOrgError, {}, status.HTTP_409_CONFLICT, ["You own an organization"]),
        (UserOwnsOrgError, {"user_id": _USER_ID}, status.HTTP_409_CONFLICT, [str(_USER_ID), "owns an organization"]),
        (
            UserOwnsOrgError,
            {"user_id": _USER_ID, "details": "Transfer ownership first"},
            status.HTTP_409_CONFLICT,
            [str(_USER_ID), "Transfer ownership"],
        ),
        # UserHasNoOrgError
        (UserHasNoOrgError, {}, status.HTTP_404_NOT_FOUND, ["You do not belong"]),
        (UserHasNoOrgError, {"user_id": _USER_ID}, status.HTTP_404_NOT_FOUND, [str(_USER_ID), "does not belong"]),
        (
            UserHasNoOrgError,
            {"user_id": _USER_ID, "details": "Must join before uploading"},
            status.HTTP_404_NOT_FOUND,
            [str(_USER_ID), "Must join"],
        ),
        # UserIsNotMemberError
        (UserIsNotMemberError, {}, status.HTTP_403_FORBIDDEN, ["You do not belong to this organization"]),
        (UserIsNotMemberError, {"user_id": _USER_ID}, status.HTTP_403_FORBIDDEN, [str(_USER_ID), "does not belong"]),
        (
            UserIsNotMemberError,
            {"user_id": _USER_ID, "organization_id": _ORG_ID},
            status.HTTP_403_FORBIDDEN,
            [str(_USER_ID), str(_ORG_ID)],
        ),
        (
            UserIsNotMemberError,
            {"user_id": _USER_ID, "organization_id": _ORG_ID, "details": "Membership denied"},
            status.HTTP_403_FORBIDDEN,
            [str(_USER_ID), str(_ORG_ID), "Membership denied"],
        ),
        # UserDoesNotOwnOrgError
        (UserDoesNotOwnOrgError, {}, status.HTTP_403_FORBIDDEN, ["You do not own"]),
        (
            UserDoesNotOwnOrgError,
            {"user_id": _USER_ID, "details": "Owner privileges required"},
            status.HTTP_403_FORBIDDEN,
            [str(_USER_ID), "Owner privileges"],
        ),
        # OrganizationHasMembersError
        (
            OrganizationHasMembersError,
            {},
            status.HTTP_409_CONFLICT,
            ["has members and cannot be deleted", "Transfer ownership"],
        ),
        (
            OrganizationHasMembersError,
            {"organization_id": _ORG_ID},
            status.HTTP_409_CONFLICT,
            [str(_ORG_ID), "cannot be deleted"],
        ),
        # OrganizationNameExistsError
        (OrganizationNameExistsError, {}, status.HTTP_409_CONFLICT, ["Organization with this name already exists"]),
        (OrganizationNameExistsError, {"msg": "Duplicate: TU Berlin Lab"}, status.HTTP_409_CONFLICT, ["TU Berlin Lab"]),
        # DisposableEmailError
        (
            DisposableEmailError,
            {"email": "temp@guerrillamail.com"},
            status.HTTP_400_BAD_REQUEST,
            ["temp@guerrillamail.com", "disposable", "not allowed"],
        ),
        # InvalidOAuthProviderError
        (
            InvalidOAuthProviderError,
            {"provider": "discord"},
            status.HTTP_400_BAD_REQUEST,
            ["Invalid OAuth provider", "discord"],
        ),
        # OAuthAccountNotLinkedError
        (
            OAuthAccountNotLinkedError,
            {"provider": "google"},
            status.HTTP_404_NOT_FOUND,
            ["OAuth account not linked", "google"],
        ),
        # RefreshToken errors
        (RefreshTokenNotFoundError, {}, status.HTTP_401_UNAUTHORIZED, ["Refresh token not found"]),
        (RefreshTokenInvalidError, {}, status.HTTP_401_UNAUTHORIZED, ["Invalid or expired refresh token"]),
        (RefreshTokenRevokedError, {}, status.HTTP_401_UNAUTHORIZED, ["Token has been revoked"]),
        (RefreshTokenUserInactiveError, {}, status.HTTP_401_UNAUTHORIZED, ["User not found or inactive"]),
    ],
    ids=lambda v: v.__name__ if isinstance(v, type) else "",
)
def test_api_error_status_and_message(
    exception_cls: type[APIError],
    kwargs: dict,
    expected_status: int,
    expected_fragments: list[str],
) -> None:
    """Each APIError subclass produces the correct HTTP status and message."""
    error = exception_cls(**kwargs)
    assert error.http_status_code == expected_status
    for fragment in expected_fragments:
        assert fragment in error.message, f"Expected '{fragment}' in '{error.message}'"


def test_user_ownership_error_message() -> None:
    """UserOwnershipError includes model name, user_id, and model_id."""
    mock_model = Mock()
    mock_model.model_label = "Product"

    user_id = uuid4()
    model_id = uuid4()
    error = UserOwnershipError(model_type=mock_model, model_id=model_id, user_id=user_id)

    assert error.http_status_code == status.HTTP_403_FORBIDDEN
    assert "Product" in error.message
    assert str(user_id) in error.message
    assert str(model_id) in error.message
    assert "does not own" in error.message.lower()


@pytest.mark.parametrize(
    ("error_cls", "kwargs", "expected_status", "expected_detail"),
    [
        (OAuthStateDecodeError, {}, 400, ErrorCode.ACCESS_TOKEN_DECODE_ERROR),
        (OAuthStateExpiredError, {}, 400, ErrorCode.ACCESS_TOKEN_ALREADY_EXPIRED),
        (OAuthInvalidStateError, {}, 400, ErrorCode.OAUTH_INVALID_STATE),
        (OAuthInvalidRedirectURIError, {}, 400, "Invalid redirect_uri"),
        (OAuthEmailUnavailableError, {}, 400, ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL),
        (OAuthUserAlreadyExistsHTTPError, {}, 400, ErrorCode.OAUTH_USER_ALREADY_EXISTS),
        (OAuthInactiveUserHTTPError, {}, 400, ErrorCode.LOGIN_BAD_CREDENTIALS),
        (OAuthAccountAlreadyLinkedError, {}, 400, "This account is already linked to another user."),
        (RegistrationUserAlreadyExistsHTTPError, {}, 409, "already exists"),
        (RegistrationInvalidPasswordHTTPError, {"reason": "score below threshold"}, 400, "Password validation failed"),
        (RegistrationUnexpectedHTTPError, {}, 500, "An unexpected error occurred during registration"),
    ],
    ids=lambda v: v.__name__ if isinstance(v, type) else "",
)
def test_http_error_adapter(
    error_cls: type,
    kwargs: dict,
    expected_status: int,
    expected_detail: str | ErrorCode,
) -> None:
    """OAuth and registration HTTP error adapters preserve stable status codes and details."""
    error = error_cls(**kwargs)
    assert error.status_code == expected_status
    if isinstance(expected_detail, str):
        assert expected_detail in error.detail
    else:
        assert error.detail == expected_detail


class TestExceptionInheritanceChain:
    """Tests for verifying the complete exception inheritance chain."""

    def test_all_auth_crud_errors_inherit_from_api_error(self) -> None:
        """Verify all AuthCRUDError subclasses ultimately inherit from APIError."""
        crud_error_subclasses = [
            UserNameAlreadyExistsError,
            AlreadyMemberError,
            UserOwnsOrgError,
            UserHasNoOrgError,
            UserIsNotMemberError,
            UserDoesNotOwnOrgError,
            OrganizationHasMembersError,
            OrganizationNameExistsError,
            DisposableEmailError,
        ]

        for error_class in crud_error_subclasses:
            assert issubclass(error_class, APIError), f"{error_class.__name__} must inherit from APIError"

    def test_exception_can_be_caught_as_api_error(self) -> None:
        """Verify exceptions can be caught as APIError."""
        with pytest.raises(APIError):
            raise UserNameAlreadyExistsError(username="test")

    def test_exception_can_be_caught_as_auth_crud_error(self) -> None:
        """Verify AuthCRUDError subclasses can be caught as AuthCRUDError."""
        with pytest.raises(AuthCRUDError):
            raise UserNameAlreadyExistsError(username="test")


class TestHandleOrganizationIntegrityError:
    """Tests for handle_organization_integrity_error."""

    def test_raises_org_name_exists_on_unique_violation(self) -> None:
        """Test that unique violation raises OrganizationNameExistsError."""
        mock_orig = Mock()
        mock_orig.pgcode = "23505"
        e = IntegrityError("statement", {}, mock_orig)

        with pytest.raises(OrganizationNameExistsError):
            handle_organization_integrity_error(e, "creating")

    def test_raises_internal_server_error_on_other_db_error(self) -> None:
        """Test that non-unique violations raise InternalServerError."""
        mock_orig = Mock()
        mock_orig.pgcode = "23503"  # Foreign key violation
        e = IntegrityError("statement", {}, mock_orig)

        with pytest.raises(APIError, match="Internal server error"):
            handle_organization_integrity_error(e, "creating")
