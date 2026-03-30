"""Unit tests for common utilities."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from app.api.common.exceptions import APIError

if TYPE_CHECKING:
    from typing import Never


@pytest.mark.unit
class TestAPIError:
    """Test custom API error exception."""

    def test_api_error_creation_message_only(self) -> None:
        """Test that APIError can be created with just a message."""
        error = APIError(message="Test error")
        assert error.message == "Test error"
        assert error.details is None
        assert str(error) == "Test error"

    def test_api_error_creation_with_details(self) -> None:
        """Test that APIError can be created with both message and details."""
        error = APIError(message="Validation failed", details="Field 'email' is invalid")
        assert error.message == "Validation failed"
        assert error.details == "Field 'email' is invalid"

    def test_api_error_default_status_code(self) -> None:
        """Test that the default HTTP status code for APIError is 500."""
        assert APIError(message="x").http_status_code == 500

    def test_api_error_subclass_custom_status_code(self) -> None:
        """Test that a subclass of APIError can define a custom HTTP status code."""

        class NotFoundError(APIError):
            http_status_code = 404

        assert NotFoundError(message="not found").http_status_code == 404

    def test_api_error_is_raisable(self) -> Never:
        """Test that APIError can be raised and caught."""
        with pytest.raises(APIError, match="Test"):
            raise APIError(message="Test")
