"""Tests for authentication exceptions module.

Tests validate exception hierarchy, HTTP status codes, and message formatting.
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

# Constants for test values to avoid magic value warnings
ALREADY_TAKEN = "already taken"
ALREADY_BELONG_PERSONAL = "You already belong to an organization"
ALREADY_BELONG_USER = "already belongs to an organization"
OWN_ORG_PERSONAL = "You own an organization"
OWN_ORG_USER = "owns an organization"
NO_ORG_PERSONAL = "You do not belong to an organization"
NO_ORG_USER = "does not belong to an organization"
NOT_BELONG_ORG_PERSONAL = "You do not belong to this organization"
NOT_BELONG_ORG_USER = "does not belong to the organization"
NOT_OWN_ORG_PERSONAL = "You do not own an organization"
NOT_OWN_ORG_USER = "does not own an organization"
CANNOT_BE_DELETED = "has members and cannot be deleted"
REMEDIATION_TRANSFER = "Transfer ownership"
ORG_HAS_MEMBERS_REMEDIATION = "Transfer ownership or remove members first"
ORG_EXISTS = "Organization with this name already exists"
TEST_MODEL_NAME = "TestModel"
DOES_NOT_OWN = "does not own"
DISPOSABLE_EMAIL_MSG = "disposable email"
NOT_ALLOWED = "not allowed"
INVALID_OAUTH_PROVIDER = "Invalid OAuth provider"
OAUTH_NOT_LINKED = "OAuth account not linked"
REFRESH_NOT_FOUND = "Refresh token not found"
REFRESH_INVALID = "Invalid or expired refresh token"
REFRESH_REVOKED = "Token has been revoked"
REFRESH_INACTIVE_USER = "User not found or inactive"
OAUTH_INVALID_REDIRECT = "Invalid redirect_uri"
OAUTH_LINKED_OTHER = "This account is already linked to another user."
REGISTRATION_ALREADY_EXISTS = "already exists"
REGISTRATION_PASSWORD_FAILED = "Password validation failed"
REGISTRATION_UNEXPECTED = "An unexpected error occurred during registration"


@pytest.mark.unit
class TestAuthCRUDErrorHierarchy:
    """Test the exception class hierarchy."""

    def test_auth_crud_error_is_not_api_error(self) -> None:
        """Verify AuthCRUDError stays a marker mixin, while subclasses inherit APIError via concrete families."""
        assert not issubclass(AuthCRUDError, APIError)

    def test_user_ownership_error_is_api_error_not_auth_crud(self) -> None:
        """Verify UserOwnershipError inherits from APIError directly, not AuthCRUDError."""
        assert issubclass(UserOwnershipError, APIError)
        assert not issubclass(UserOwnershipError, AuthCRUDError)


@pytest.mark.unit
class TestUserNameAlreadyExistsError:
    """Tests for UserNameAlreadyExistsError."""

    def test_http_status_code_is_409_conflict(self) -> None:
        """Verify UserNameAlreadyExistsError has 409 Conflict status."""
        assert UserNameAlreadyExistsError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_includes_username(self) -> None:
        """Verify error message includes the duplicate username."""
        username = "duplicate_user"
        error = UserNameAlreadyExistsError(username=username)
        assert username in error.message
        assert ALREADY_TAKEN in error.message.lower()

    def test_error_message_with_special_characters(self) -> None:
        """Verify error message handles usernames with special characters."""
        username = "user@example.com"
        error = UserNameAlreadyExistsError(username=username)
        assert username in error.message

    def test_error_message_with_unicode_username(self) -> None:
        """Verify error message handles unicode usernames."""
        username = "用户名"  # Chinese characters
        error = UserNameAlreadyExistsError(username=username)
        assert username in error.message


@pytest.mark.unit
class TestAlreadyMemberError:
    """Tests for AlreadyMemberError."""

    def test_http_status_code_is_409_conflict(self) -> None:
        """Verify AlreadyMemberError has 409 Conflict status."""
        assert AlreadyMemberError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_without_user_id(self) -> None:
        """Verify error message without user_id uses personal phrasing."""
        error = AlreadyMemberError()
        assert ALREADY_BELONG_PERSONAL in error.message

    def test_error_message_with_user_id(self) -> None:
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = AlreadyMemberError(user_id=user_id)
        assert str(user_id) in error.message
        assert ALREADY_BELONG_USER in error.message

    def test_error_message_with_user_id_and_details(self) -> None:
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "User is an active member"
        error = AlreadyMemberError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message

    def test_error_message_with_details_only(self) -> None:
        """Verify error message includes details without user_id."""
        details = "Additional context"
        error = AlreadyMemberError(details=details)
        assert ALREADY_BELONG_PERSONAL in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserOwnsOrgError:
    """Tests for UserOwnsOrgError."""

    def test_http_status_code_is_409_conflict(self) -> None:
        """Verify UserOwnsOrgError has 409 Conflict status."""
        assert UserOwnsOrgError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_without_user_id(self) -> None:
        """Verify error message without user_id uses personal phrasing."""
        error = UserOwnsOrgError()
        assert OWN_ORG_PERSONAL in error.message

    def test_error_message_with_user_id(self) -> None:
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = UserOwnsOrgError(user_id=user_id)
        assert str(user_id) in error.message
        assert OWN_ORG_USER in error.message

    def test_error_message_with_user_id_and_details(self) -> None:
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "User must transfer ownership"
        error = UserOwnsOrgError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserHasNoOrgError:
    """Tests for UserHasNoOrgError."""

    def test_http_status_code_is_404_not_found(self) -> None:
        """Verify UserHasNoOrgError has 404 Not Found status."""
        assert UserHasNoOrgError.http_status_code == status.HTTP_404_NOT_FOUND

    def test_error_message_without_user_id(self) -> None:
        """Verify error message without user_id uses personal phrasing."""
        error = UserHasNoOrgError()
        assert NO_ORG_PERSONAL in error.message

    def test_error_message_with_user_id(self) -> None:
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = UserHasNoOrgError(user_id=user_id)
        assert str(user_id) in error.message
        assert NO_ORG_USER in error.message

    def test_error_message_with_user_id_and_details(self) -> None:
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "User needs to join first"
        error = UserHasNoOrgError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserIsNotMemberError:
    """Tests for UserIsNotMemberError."""

    def test_http_status_code_is_403_forbidden(self) -> None:
        """Verify UserIsNotMemberError has 403 Forbidden status."""
        assert UserIsNotMemberError.http_status_code == status.HTTP_403_FORBIDDEN

    def test_error_message_without_ids(self) -> None:
        """Verify error message without IDs uses personal phrasing."""
        error = UserIsNotMemberError()
        assert NOT_BELONG_ORG_PERSONAL in error.message

    def test_error_message_with_user_id_only(self) -> None:
        """Verify error message with user_id only."""
        user_id = uuid4()
        error = UserIsNotMemberError(user_id=user_id)
        assert str(user_id) in error.message
        assert NOT_BELONG_ORG_USER in error.message

    def test_error_message_with_organization_id_only(self) -> None:
        """Verify error message with organization_id only uses generic message."""
        org_id = uuid4()
        error = UserIsNotMemberError(organization_id=org_id)
        # When only org_id is provided (no user_id), uses generic personal message
        assert NOT_BELONG_ORG_PERSONAL in error.message
        # org_id is only included in message if BOTH user_id and org_id are provided
        assert str(org_id) not in error.message

    def test_error_message_with_both_ids(self) -> None:
        """Verify error message with both user_id and organization_id."""
        user_id = uuid4()
        org_id = uuid4()
        error = UserIsNotMemberError(user_id=user_id, organization_id=org_id)
        assert str(user_id) in error.message
        assert str(org_id) in error.message

    def test_error_message_with_ids_and_details(self) -> None:
        """Verify error message with all three parameters."""
        user_id = uuid4()
        org_id = uuid4()
        details = "Membership denied"
        error = UserIsNotMemberError(user_id=user_id, organization_id=org_id, details=details)
        assert str(user_id) in error.message
        assert str(org_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserDoesNotOwnOrgError:
    """Tests for UserDoesNotOwnOrgError."""

    def test_http_status_code_is_403_forbidden(self) -> None:
        """Verify UserDoesNotOwnOrgError has 403 Forbidden status."""
        assert UserDoesNotOwnOrgError.http_status_code == status.HTTP_403_FORBIDDEN

    def test_error_message_without_user_id(self) -> None:
        """Verify error message without user_id uses personal phrasing."""
        error = UserDoesNotOwnOrgError()
        assert NOT_OWN_ORG_PERSONAL in error.message

    def test_error_message_with_user_id(self) -> None:
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = UserDoesNotOwnOrgError(user_id=user_id)
        assert str(user_id) in error.message

    def test_error_message_with_user_id_and_details(self) -> None:
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "Owner privileges required"
        error = UserDoesNotOwnOrgError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestInvalidOAuthProviderError:
    """Tests for InvalidOAuthProviderError."""

    def test_http_status_code_is_400_bad_request(self) -> None:
        """Verify InvalidOAuthProviderError has 400 Bad Request status."""
        assert InvalidOAuthProviderError.http_status_code == status.HTTP_400_BAD_REQUEST

    def test_error_message_includes_provider(self) -> None:
        """Verify the invalid provider is included in the error message."""
        provider = "discord"
        error = InvalidOAuthProviderError(provider)
        assert INVALID_OAUTH_PROVIDER in error.message
        assert provider in error.message


@pytest.mark.unit
class TestOAuthAccountNotLinkedError:
    """Tests for OAuthAccountNotLinkedError."""

    def test_http_status_code_is_404_not_found(self) -> None:
        """Verify OAuthAccountNotLinkedError has 404 Not Found status."""
        assert OAuthAccountNotLinkedError.http_status_code == status.HTTP_404_NOT_FOUND

    def test_error_message_includes_provider(self) -> None:
        """Verify the provider is included in the missing-link message."""
        provider = "google"
        error = OAuthAccountNotLinkedError(provider)
        assert OAUTH_NOT_LINKED in error.message
        assert provider in error.message


@pytest.mark.unit
class TestRefreshTokenErrors:
    """Tests for refresh token auth errors."""

    def test_refresh_token_not_found_error(self) -> None:
        """Verify missing refresh tokens produce 401 with the expected message."""
        error = RefreshTokenNotFoundError()
        assert error.http_status_code == status.HTTP_401_UNAUTHORIZED
        assert error.message == REFRESH_NOT_FOUND

    def test_refresh_token_invalid_error(self) -> None:
        """Verify invalid or expired refresh tokens produce 401."""
        error = RefreshTokenInvalidError()
        assert error.http_status_code == status.HTTP_401_UNAUTHORIZED
        assert error.message == REFRESH_INVALID

    def test_refresh_token_revoked_error(self) -> None:
        """Verify revoked refresh tokens produce 401."""
        error = RefreshTokenRevokedError()
        assert error.http_status_code == status.HTTP_401_UNAUTHORIZED
        assert error.message == REFRESH_REVOKED

    def test_refresh_token_user_inactive_error(self) -> None:
        """Verify inactive refresh-token users produce 401."""
        error = RefreshTokenUserInactiveError()
        assert error.http_status_code == status.HTTP_401_UNAUTHORIZED
        assert error.message == REFRESH_INACTIVE_USER


@pytest.mark.unit
class TestOAuthHTTPErrorAdapters:
    """Tests for OAuth-specific HTTPException subclasses."""

    def test_oauth_state_decode_error(self) -> None:
        """Verify invalid state JWT maps to the stable decode error detail."""
        error = OAuthStateDecodeError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == ErrorCode.ACCESS_TOKEN_DECODE_ERROR

    def test_oauth_state_expired_error(self) -> None:
        """Verify expired state JWT maps to the stable expired detail."""
        error = OAuthStateExpiredError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == ErrorCode.ACCESS_TOKEN_ALREADY_EXPIRED

    def test_oauth_invalid_state_error(self) -> None:
        """Verify CSRF state mismatches keep the stable invalid-state detail."""
        error = OAuthInvalidStateError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == ErrorCode.OAUTH_INVALID_STATE

    def test_oauth_invalid_redirect_uri_error(self) -> None:
        """Verify rejected redirect URIs keep the existing string detail."""
        error = OAuthInvalidRedirectURIError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == OAUTH_INVALID_REDIRECT

    def test_oauth_email_unavailable_error(self) -> None:
        """Verify missing provider emails keep the stable FastAPI Users detail."""
        error = OAuthEmailUnavailableError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == ErrorCode.OAUTH_NOT_AVAILABLE_EMAIL

    def test_oauth_user_already_exists_http_error(self) -> None:
        """Verify OAuth duplicate-user collisions keep the stable detail code."""
        error = OAuthUserAlreadyExistsHTTPError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == ErrorCode.OAUTH_USER_ALREADY_EXISTS

    def test_oauth_inactive_user_http_error(self) -> None:
        """Verify inactive OAuth users keep the stable login-bad-credentials detail."""
        error = OAuthInactiveUserHTTPError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == ErrorCode.LOGIN_BAD_CREDENTIALS

    def test_oauth_account_already_linked_error(self) -> None:
        """Verify duplicate OAuth associations keep the existing human-readable detail."""
        error = OAuthAccountAlreadyLinkedError()
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert error.detail == OAUTH_LINKED_OTHER


@pytest.mark.unit
class TestRegistrationHTTPErrorAdapters:
    """Tests for registration-specific HTTPException subclasses."""

    def test_registration_user_already_exists_http_error(self) -> None:
        """Verify duplicate registration emails keep the stable conflict detail."""
        error = RegistrationUserAlreadyExistsHTTPError()
        assert error.status_code == status.HTTP_409_CONFLICT
        assert REGISTRATION_ALREADY_EXISTS in error.detail

    def test_registration_invalid_password_http_error(self) -> None:
        """Verify invalid registration passwords keep the stable validation detail."""
        error = RegistrationInvalidPasswordHTTPError("too short")
        assert error.status_code == status.HTTP_400_BAD_REQUEST
        assert REGISTRATION_PASSWORD_FAILED in error.detail
        assert "too short" in error.detail

    def test_registration_unexpected_http_error(self) -> None:
        """Verify unexpected registration failures keep the stable 500 detail."""
        error = RegistrationUnexpectedHTTPError()
        assert error.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert error.detail == REGISTRATION_UNEXPECTED


@pytest.mark.unit
class TestOrganizationHasMembersError:
    """Tests for OrganizationHasMembersError."""

    def test_http_status_code_is_409_conflict(self) -> None:
        """Verify OrganizationHasMembersError has 409 Conflict status."""
        assert OrganizationHasMembersError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_without_organization_id(self) -> None:
        """Verify error message without organization_id."""
        error = OrganizationHasMembersError()
        assert CANNOT_BE_DELETED in error.message
        assert ORG_HAS_MEMBERS_REMEDIATION in error.message

    def test_error_message_with_organization_id(self) -> None:
        """Verify error message includes organization_id when provided."""
        org_id = uuid4()
        error = OrganizationHasMembersError(organization_id=org_id)
        assert str(org_id) in error.message
        assert CANNOT_BE_DELETED in error.message

    def test_error_message_includes_remediation_guidance(self) -> None:
        """Verify error message includes remediation steps."""
        error = OrganizationHasMembersError()
        assert REMEDIATION_TRANSFER in error.message


@pytest.mark.unit
class TestOrganizationNameExistsError:
    """Tests for OrganizationNameExistsError."""

    def test_http_status_code_is_409_conflict(self) -> None:
        """Verify OrganizationNameExistsError has 409 Conflict status."""
        assert OrganizationNameExistsError.http_status_code == status.HTTP_409_CONFLICT

    def test_default_error_message(self) -> None:
        """Verify default error message when no message provided."""
        error = OrganizationNameExistsError()
        assert ORG_EXISTS in error.message

    def test_custom_error_message(self) -> None:
        """Verify custom error message can be provided."""
        custom_msg = "Custom organization error"
        error = OrganizationNameExistsError(msg=custom_msg)
        assert custom_msg in error.message


@pytest.mark.unit
class TestUserOwnershipError:
    """Tests for UserOwnershipError."""

    def test_http_status_code_is_403_forbidden(self) -> None:
        """Verify UserOwnershipError has 403 Forbidden status."""
        assert UserOwnershipError.http_status_code == status.HTTP_403_FORBIDDEN

    def test_error_message_format(self) -> None:
        """Verify error message includes model name, user_id, model_id and does-not-own phrasing."""
        mock_model = Mock()
        mock_model.get_api_model_name.return_value.name_capital = TEST_MODEL_NAME

        user_id = uuid4()
        model_id = uuid4()
        error = UserOwnershipError(model_type=mock_model, model_id=model_id, user_id=user_id)

        assert TEST_MODEL_NAME in error.message
        assert str(user_id) in error.message
        assert str(model_id) in error.message
        assert DOES_NOT_OWN in error.message.lower()


@pytest.mark.unit
class TestDisposableEmailError:
    """Tests for DisposableEmailError."""

    def test_http_status_code_is_400_bad_request(self) -> None:
        """Verify DisposableEmailError has 400 Bad Request status."""
        assert DisposableEmailError.http_status_code == status.HTTP_400_BAD_REQUEST

    def test_error_message_includes_email(self) -> None:
        """Verify error message includes the disposable email address."""
        email = "temp@tempmail.com"
        error = DisposableEmailError(email=email)
        assert email in error.message
        assert DISPOSABLE_EMAIL_MSG in error.message.lower()

    def test_error_message_with_various_email_formats(self) -> None:
        """Verify error message handles various email formats."""
        emails = [
            "user@10minutemail.com",
            "test@guerrillemail.com",
            "name.surname@throwaway.email",
        ]
        for email in emails:
            error = DisposableEmailError(email=email)
            assert email in error.message
            assert NOT_ALLOWED in error.message.lower()


@pytest.mark.unit
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
        try:
            raise UserNameAlreadyExistsError(username="test")
        except APIError:
            pass  # Expected
        else:
            pytest.fail("UserNameAlreadyExistsError should be able to be caught as APIError")

    def test_exception_can_be_caught_as_auth_crud_error(self) -> None:
        """Verify AuthCRUDError subclasses can be caught as AuthCRUDError."""
        try:
            raise UserNameAlreadyExistsError(username="test")
        except AuthCRUDError:
            pass  # Expected
        else:
            pytest.fail("UserNameAlreadyExistsError should be able to be caught as AuthCRUDError")


@pytest.mark.unit
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
