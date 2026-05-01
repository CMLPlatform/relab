"""Unit tests for Google ID token verification logic in the PKCE token-exchange router."""

from __future__ import annotations

import contextlib
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest
from jwt import ExpiredSignatureError, InvalidTokenError

from app.api.auth.exceptions import (
    OAuthEmailUnavailableError,
    OAuthStateDecodeError,
    OAuthStateExpiredError,
)
from app.api.auth.routers.oauth_token import _verify_google_id_token
from app.api.common.exceptions import ServiceUnavailableError

if TYPE_CHECKING:
    from collections.abc import Iterator
    from contextlib import AbstractContextManager

_VALID_PAYLOAD = {
    "sub": "google-user-123",
    "email": "user@example.com",
    "email_verified": True,
    "iss": "https://accounts.google.com",
    "exp": 9_999_999_999,
}


def _mock_signing_key() -> MagicMock:
    key = MagicMock()
    key.key = "mock-rsa-key"
    return key


def _patched(
    payload: dict | None = None,
    *,
    side_effect: type[Exception] | None = None,
) -> AbstractContextManager[None]:
    """Context manager that patches all three external dependencies of _verify_google_id_token."""
    mock_key = _mock_signing_key()

    jwks_patch = patch(
        "app.api.auth.routers.oauth_token._google_jwks_client.get_signing_key_from_jwt",
        return_value=mock_key,
    )
    if side_effect:
        decode_patch = patch("app.api.auth.routers.oauth_token.jwt.decode", side_effect=side_effect)
    else:
        decode_patch = patch("app.api.auth.routers.oauth_token.jwt.decode", return_value=payload)

    client_id_mock = MagicMock()
    client_id_mock.get_secret_value.return_value = "test-client-id"
    settings_patch = patch(
        "app.api.auth.routers.oauth_token.auth_settings.google_oauth_client_id",
        new=client_id_mock,
    )

    @contextlib.contextmanager
    def _ctx() -> Iterator[None]:
        with jwks_patch, decode_patch, settings_patch:
            yield

    return _ctx()


class TestVerifyGoogleIdToken:
    """Unit tests for _verify_google_id_token."""

    def test_valid_token_returns_payload(self) -> None:
        """A valid ID token with a verified email and known issuer should return its claims."""
        with _patched(_VALID_PAYLOAD):
            result = _verify_google_id_token("mock-token")

        assert result == _VALID_PAYLOAD

    def test_accounts_google_com_issuer_is_accepted(self) -> None:
        """The scheme-less issuer 'accounts.google.com' is also valid."""
        payload = {**_VALID_PAYLOAD, "iss": "accounts.google.com"}

        with _patched(payload):
            result = _verify_google_id_token("mock-token")

        assert result["iss"] == "accounts.google.com"

    def test_expired_token_raises_state_expired_error(self) -> None:
        """jwt.ExpiredSignatureError from PyJWT should surface as OAuthStateExpiredError."""
        with _patched(side_effect=ExpiredSignatureError), pytest.raises(OAuthStateExpiredError):
            _verify_google_id_token("expired-token")

    def test_invalid_token_raises_state_decode_error(self) -> None:
        """Any other JWT validation failure should surface as OAuthStateDecodeError."""
        with _patched(side_effect=InvalidTokenError), pytest.raises(OAuthStateDecodeError):
            _verify_google_id_token("bad-token")

    def test_wrong_issuer_raises_state_decode_error(self) -> None:
        """A payload whose 'iss' is not in the Google issuer set should be rejected."""
        payload = {**_VALID_PAYLOAD, "iss": "https://evil.example.com"}

        with _patched(payload), pytest.raises(OAuthStateDecodeError):
            _verify_google_id_token("wrong-issuer-token")

    def test_missing_issuer_raises_state_decode_error(self) -> None:
        """A payload with no 'iss' field should be rejected."""
        payload = {k: v for k, v in _VALID_PAYLOAD.items() if k != "iss"}

        with _patched(payload), pytest.raises(OAuthStateDecodeError):
            _verify_google_id_token("no-issuer-token")

    def test_unverified_email_raises_email_unavailable_error(self) -> None:
        """A token where email_verified is False should raise OAuthEmailUnavailableError."""
        payload = {**_VALID_PAYLOAD, "email_verified": False}

        with _patched(payload), pytest.raises(OAuthEmailUnavailableError):
            _verify_google_id_token("unverified-email-token")

    def test_missing_email_verified_raises_email_unavailable_error(self) -> None:
        """A payload without an email_verified claim should be treated as unverified."""
        payload = {k: v for k, v in _VALID_PAYLOAD.items() if k != "email_verified"}

        with _patched(payload), pytest.raises(OAuthEmailUnavailableError):
            _verify_google_id_token("no-email-verified-token")

    def test_unconfigured_client_id_raises_503(self) -> None:
        """If the Google OAuth client ID is not set, the endpoint should be unavailable."""
        empty_client_id = MagicMock()
        empty_client_id.get_secret_value.return_value = ""

        with (
            patch("app.api.auth.routers.oauth_token.auth_settings.google_oauth_client_id", new=empty_client_id),
            pytest.raises(ServiceUnavailableError) as exc_info,
        ):
            _verify_google_id_token("any-token")

        assert exc_info.value.message == "Authentication service unavailable."
