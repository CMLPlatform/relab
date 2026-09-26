"""Tests for authentication exceptions module.

Tests validate exception hierarchy, HTTP status codes, and message formatting.
"""

import pytest
from fastapi import status
from fastapi_users.router.common import ErrorCode

from app.api.auth.exceptions import (
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
    RefreshTokenInvalidError,
    RefreshTokenNotFoundError,
    RefreshTokenRevokedError,
    RefreshTokenUserInactiveError,
    RegistrationInvalidPasswordHTTPError,
    RegistrationUnexpectedHTTPError,
    UserNameAlreadyExistsError,
)
from app.api.common.exceptions import APIError


def test_auth_crud_error_is_not_api_error() -> None:
    """Verify AuthCRUDError stays a marker mixin, while subclasses inherit APIError via concrete families."""
    assert not issubclass(AuthCRUDError, APIError)


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
        # DisposableEmailError
        (
            DisposableEmailError,
            {"email": "temp@guerrillamail.com"},
            status.HTTP_400_BAD_REQUEST,
            ["Disposable", "not allowed"],
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
        (RegistrationInvalidPasswordHTTPError, {"reason": "score below threshold"}, 400, "Password validation failed"),
        (RegistrationUnexpectedHTTPError, {}, 500, "Registration could not be completed"),
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
