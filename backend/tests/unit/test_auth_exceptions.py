"""Tests for authentication exceptions module.

Tests validate exception hierarchy, HTTP status codes, and message formatting.
"""

from uuid import uuid4

import pytest
from fastapi import status
from pydantic import UUID4

from app.api.auth.exceptions import (
    AlreadyMemberError,
    AuthCRUDError,
    DisposableEmailError,
    OrganizationHasMembersError,
    OrganizationNameExistsError,
    UserDoesNotOwnOrgError,
    UserHasNoOrgError,
    UserIsNotMemberError,
    UserNameAlreadyExistsError,
    UserOwnershipError,
    UserOwnsOrgError,
)
from app.api.common.exceptions import APIError


@pytest.mark.unit
class TestAuthCRUDErrorHierarchy:
    """Test the exception class hierarchy."""

    def test_auth_crud_error_is_api_error(self):
        """Verify AuthCRUDError inherits from APIError."""
        assert issubclass(AuthCRUDError, APIError)

    def test_user_name_already_exists_error_is_auth_crud_error(self):
        """Verify UserNameAlreadyExistsError inherits from AuthCRUDError."""
        assert issubclass(UserNameAlreadyExistsError, AuthCRUDError)

    def test_already_member_error_is_auth_crud_error(self):
        """Verify AlreadyMemberError inherits from AuthCRUDError."""
        assert issubclass(AlreadyMemberError, AuthCRUDError)

    def test_user_ownership_error_is_api_error_not_auth_crud(self):
        """Verify UserOwnershipError inherits from APIError directly, not AuthCRUDError."""
        assert issubclass(UserOwnershipError, APIError)
        assert not issubclass(UserOwnershipError, AuthCRUDError)


@pytest.mark.unit
class TestUserNameAlreadyExistsError:
    """Tests for UserNameAlreadyExistsError."""

    def test_http_status_code_is_409_conflict(self):
        """Verify UserNameAlreadyExistsError has 409 Conflict status."""
        assert UserNameAlreadyExistsError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_includes_username(self):
        """Verify error message includes the duplicate username."""
        username = "duplicate_user"
        error = UserNameAlreadyExistsError(username=username)
        assert username in error.message
        assert "already taken" in error.message.lower()

    def test_error_message_with_special_characters(self):
        """Verify error message handles usernames with special characters."""
        username = "user@example.com"
        error = UserNameAlreadyExistsError(username=username)
        assert username in error.message

    def test_error_message_with_unicode_username(self):
        """Verify error message handles unicode usernames."""
        username = "用户名"  # Chinese characters
        error = UserNameAlreadyExistsError(username=username)
        assert username in error.message


@pytest.mark.unit
class TestAlreadyMemberError:
    """Tests for AlreadyMemberError."""

    def test_http_status_code_is_409_conflict(self):
        """Verify AlreadyMemberError has 409 Conflict status."""
        assert AlreadyMemberError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_without_user_id(self):
        """Verify error message without user_id uses personal phrasing."""
        error = AlreadyMemberError()
        assert "You already belong to an organization" in error.message

    def test_error_message_with_user_id(self):
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = AlreadyMemberError(user_id=user_id)
        assert str(user_id) in error.message
        assert "already belongs to an organization" in error.message

    def test_error_message_with_user_id_and_details(self):
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "User is an active member"
        error = AlreadyMemberError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message

    def test_error_message_with_details_only(self):
        """Verify error message includes details without user_id."""
        details = "Additional context"
        error = AlreadyMemberError(details=details)
        assert "You already belong to an organization" in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserOwnsOrgError:
    """Tests for UserOwnsOrgError."""

    def test_http_status_code_is_409_conflict(self):
        """Verify UserOwnsOrgError has 409 Conflict status."""
        assert UserOwnsOrgError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_without_user_id(self):
        """Verify error message without user_id uses personal phrasing."""
        error = UserOwnsOrgError()
        assert "You own an organization" in error.message

    def test_error_message_with_user_id(self):
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = UserOwnsOrgError(user_id=user_id)
        assert str(user_id) in error.message
        assert "owns an organization" in error.message

    def test_error_message_with_user_id_and_details(self):
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "User must transfer ownership"
        error = UserOwnsOrgError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserHasNoOrgError:
    """Tests for UserHasNoOrgError."""

    def test_http_status_code_is_404_not_found(self):
        """Verify UserHasNoOrgError has 404 Not Found status."""
        assert UserHasNoOrgError.http_status_code == status.HTTP_404_NOT_FOUND

    def test_error_message_without_user_id(self):
        """Verify error message without user_id uses personal phrasing."""
        error = UserHasNoOrgError()
        assert "You do not belong to an organization" in error.message

    def test_error_message_with_user_id(self):
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = UserHasNoOrgError(user_id=user_id)
        assert str(user_id) in error.message
        assert "does not belong to an organization" in error.message

    def test_error_message_with_user_id_and_details(self):
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "User needs to join first"
        error = UserHasNoOrgError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestUserIsNotMemberError:
    """Tests for UserIsNotMemberError."""

    def test_http_status_code_is_403_forbidden(self):
        """Verify UserIsNotMemberError has 403 Forbidden status."""
        assert UserIsNotMemberError.http_status_code == status.HTTP_403_FORBIDDEN

    def test_error_message_without_ids(self):
        """Verify error message without IDs uses personal phrasing."""
        error = UserIsNotMemberError()
        assert "You do not belong to this organization" in error.message

    def test_error_message_with_user_id_only(self):
        """Verify error message with user_id only."""
        user_id = uuid4()
        error = UserIsNotMemberError(user_id=user_id)
        assert str(user_id) in error.message
        assert "does not belong to the organization" in error.message

    def test_error_message_with_organization_id_only(self):
        """Verify error message with organization_id only uses generic message."""
        org_id = uuid4()
        error = UserIsNotMemberError(organization_id=org_id)
        # When only org_id is provided (no user_id), uses generic personal message
        assert "You do not belong to this organization" in error.message
        # org_id is only included in message if BOTH user_id and org_id are provided
        assert str(org_id) not in error.message

    def test_error_message_with_both_ids(self):
        """Verify error message with both user_id and organization_id."""
        user_id = uuid4()
        org_id = uuid4()
        error = UserIsNotMemberError(user_id=user_id, organization_id=org_id)
        assert str(user_id) in error.message
        assert str(org_id) in error.message

    def test_error_message_with_ids_and_details(self):
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

    def test_http_status_code_is_403_forbidden(self):
        """Verify UserDoesNotOwnOrgError has 403 Forbidden status."""
        assert UserDoesNotOwnOrgError.http_status_code == status.HTTP_403_FORBIDDEN

    def test_error_message_without_user_id(self):
        """Verify error message without user_id uses personal phrasing."""
        error = UserDoesNotOwnOrgError()
        assert "You do not own an organization" in error.message

    def test_error_message_with_user_id(self):
        """Verify error message includes user_id when provided."""
        user_id = uuid4()
        error = UserDoesNotOwnOrgError(user_id=user_id)
        assert str(user_id) in error.message
        assert "does not own an organization" in error.message

    def test_error_message_with_user_id_and_details(self):
        """Verify error message includes both user_id and details."""
        user_id = uuid4()
        details = "Owner privileges required"
        error = UserDoesNotOwnOrgError(user_id=user_id, details=details)
        assert str(user_id) in error.message
        assert details in error.message


@pytest.mark.unit
class TestOrganizationHasMembersError:
    """Tests for OrganizationHasMembersError."""

    def test_http_status_code_is_409_conflict(self):
        """Verify OrganizationHasMembersError has 409 Conflict status."""
        assert OrganizationHasMembersError.http_status_code == status.HTTP_409_CONFLICT

    def test_error_message_without_organization_id(self):
        """Verify error message without organization_id."""
        error = OrganizationHasMembersError()
        assert "has members and cannot be deleted" in error.message
        assert "Transfer ownership or remove members first" in error.message

    def test_error_message_with_organization_id(self):
        """Verify error message includes organization_id when provided."""
        org_id = uuid4()
        error = OrganizationHasMembersError(organization_id=org_id)
        assert str(org_id) in error.message
        assert "has members and cannot be deleted" in error.message

    def test_error_message_includes_remediation_guidance(self):
        """Verify error message includes remediation steps."""
        error = OrganizationHasMembersError()
        assert "Transfer ownership" in error.message or "remove members" in error.message


@pytest.mark.unit
class TestOrganizationNameExistsError:
    """Tests for OrganizationNameExistsError."""

    def test_http_status_code_is_409_conflict(self):
        """Verify OrganizationNameExistsError has 409 Conflict status."""
        assert OrganizationNameExistsError.http_status_code == status.HTTP_409_CONFLICT

    def test_default_error_message(self):
        """Verify default error message when no message provided."""
        error = OrganizationNameExistsError()
        assert "Organization with this name already exists" in error.message

    def test_custom_error_message(self):
        """Verify custom error message can be provided."""
        custom_msg = "Custom organization error"
        error = OrganizationNameExistsError(msg=custom_msg)
        assert custom_msg in error.message


@pytest.mark.unit
class TestUserOwnershipError:
    """Tests for UserOwnershipError."""

    def test_http_status_code_is_403_forbidden(self):
        """Verify UserOwnershipError has 403 Forbidden status."""
        assert UserOwnershipError.http_status_code == status.HTTP_403_FORBIDDEN

    def test_error_message_includes_model_name(self):
        """Verify error message includes the model name."""
        # Using a mock model type that has get_api_model_name method
        from unittest.mock import Mock

        mock_model = Mock()
        mock_model.get_api_model_name.return_value.name_capital = "TestModel"

        user_id = uuid4()
        model_id = uuid4()
        error = UserOwnershipError(model_type=mock_model, model_id=model_id, user_id=user_id)

        assert "TestModel" in error.message
        assert str(user_id) in error.message
        assert str(model_id) in error.message

    def test_error_message_includes_user_id(self):
        """Verify error message includes user_id."""
        from unittest.mock import Mock

        mock_model = Mock()
        mock_model.get_api_model_name.return_value.name_capital = "DataSet"

        user_id = uuid4()
        model_id = uuid4()
        error = UserOwnershipError(model_type=mock_model, model_id=model_id, user_id=user_id)

        assert str(user_id) in error.message
        assert "does not own" in error.message.lower()

    def test_error_message_includes_model_id(self):
        """Verify error message includes model_id."""
        from unittest.mock import Mock

        mock_model = Mock()
        mock_model.get_api_model_name.return_value.name_capital = "Project"

        user_id = uuid4()
        model_id = uuid4()
        error = UserOwnershipError(model_type=mock_model, model_id=model_id, user_id=user_id)

        assert str(model_id) in error.message


@pytest.mark.unit
class TestDisposableEmailError:
    """Tests for DisposableEmailError."""

    def test_http_status_code_is_400_bad_request(self):
        """Verify DisposableEmailError has 400 Bad Request status."""
        assert DisposableEmailError.http_status_code == status.HTTP_400_BAD_REQUEST

    def test_error_message_includes_email(self):
        """Verify error message includes the disposable email address."""
        email = "temp@tempmail.com"
        error = DisposableEmailError(email=email)
        assert email in error.message
        assert "disposable email" in error.message.lower()

    def test_error_message_with_various_email_formats(self):
        """Verify error message handles various email formats."""
        emails = [
            "user@10minutemail.com",
            "test@guerrillemail.com",
            "name.surname@throwaway.email",
        ]
        for email in emails:
            error = DisposableEmailError(email=email)
            assert email in error.message
            assert "not allowed" in error.message.lower()


@pytest.mark.unit
class TestExceptionInheritanceChain:
    """Tests for verifying the complete exception inheritance chain."""

    def test_all_auth_crud_errors_inherit_from_api_error(self):
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

    def test_exception_can_be_caught_as_api_error(self):
        """Verify exceptions can be caught as APIError."""
        try:
            raise UserNameAlreadyExistsError(username="test")
        except APIError:
            pass  # Expected
        else:
            pytest.fail("UserNameAlreadyExistsError should be catchable as APIError")

    def test_exception_can_be_caught_as_auth_crud_error(self):
        """Verify AuthCRUDError subclasses can be caught as AuthCRUDError."""
        try:
            raise UserNameAlreadyExistsError(username="test")
        except AuthCRUDError:
            pass  # Expected
        else:
            pytest.fail("UserNameAlreadyExistsError should be catchable as AuthCRUDError")


@pytest.mark.unit
class TestExceptionStatusCodes:
    """Tests for verifying all status codes are correctly set."""

    def test_409_conflict_errors(self):
        """Verify all 409 Conflict errors have correct status code."""
        conflict_errors = [
            UserNameAlreadyExistsError("test"),
            AlreadyMemberError(),
            UserOwnsOrgError(),
            OrganizationHasMembersError(),
            OrganizationNameExistsError(),
        ]

        for error in conflict_errors:
            assert error.http_status_code == status.HTTP_409_CONFLICT

    def test_403_forbidden_errors(self):
        """Verify all 403 Forbidden errors have correct status code."""
        forbidden_errors = [
            UserIsNotMemberError(),
            UserDoesNotOwnOrgError(),
        ]

        for error in forbidden_errors:
            assert error.http_status_code == status.HTTP_403_FORBIDDEN

    def test_404_not_found_errors(self):
        """Verify all 404 Not Found errors have correct status code."""
        error = UserHasNoOrgError()
        assert error.http_status_code == status.HTTP_404_NOT_FOUND

    def test_400_bad_request_errors(self):
        """Verify all 400 Bad Request errors have correct status code."""
        error = DisposableEmailError(email="test@tempmail.com")
        assert error.http_status_code == status.HTTP_400_BAD_REQUEST

    def test_403_ownership_error(self):
        """Verify UserOwnershipError has 403 Forbidden status code."""
        from unittest.mock import Mock

        mock_model = Mock()
        mock_model.get_api_model_name.return_value.name_capital = "TestModel"

        error = UserOwnershipError(
            model_type=mock_model,
            model_id=uuid4(),
            user_id=uuid4(),
        )
        assert error.http_status_code == status.HTTP_403_FORBIDDEN
