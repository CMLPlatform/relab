"""Unit tests for common exception handlers."""

from __future__ import annotations

import json
from typing import cast
from unittest.mock import MagicMock, patch

import pytest
from fastapi import status
from slowapi.errors import RateLimitExceeded

from app.api.common.exceptions import (
    APIError,
    InternalServerError,
    ServiceUnavailableError,
)
from app.api.common.routers.exceptions import create_exception_handler, rate_limit_handler


@pytest.mark.unit
class TestCreateExceptionHandler:
    """Tests for create_exception_handler."""

    async def test_api_error_without_details(self) -> None:
        """Test that APIError without details returns correct JSON response."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        exc = APIError("Not found")
        exc.http_status_code = status.HTTP_404_NOT_FOUND

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == 404

        body = json.loads(cast("bytes", response.body))
        assert body["detail"]["message"] == "Not found"
        assert "details" not in body["detail"]

    async def test_api_error_with_details(self) -> None:
        """Test that APIError with details includes them in response (line 30)."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        exc = APIError("Bad input", details="field value is wrong")
        exc.http_status_code = status.HTTP_400_BAD_REQUEST

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        body = json.loads(cast("bytes", response.body))
        assert "details" in body["detail"]

    async def test_server_error_logs_at_error_level(self) -> None:
        """Test that 5xx errors are logged with opt(exception=True).error (line 37)."""
        handler = create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR)
        mock_request = MagicMock()
        exc = RuntimeError("Something broke")

        mock_logger = MagicMock()
        mock_logger.opt.return_value = mock_logger
        with patch("app.api.common.routers.exceptions.logger", mock_logger):
            response = await handler(mock_request, exc)

        assert response.status_code == 500
        mock_logger.opt.assert_called_once_with(exception=True)
        mock_logger.error.assert_called_once()

        body = json.loads(cast("bytes", response.body))
        assert body["detail"]["message"] == "Internal server error"

    async def test_400_error_logs_at_warning_level(self) -> None:
        """Test that 4xx (non-404) errors are logged at warning level."""
        handler = create_exception_handler(status.HTTP_400_BAD_REQUEST)
        mock_request = MagicMock()
        exc = ValueError("Bad value")

        mock_logger = MagicMock()
        with patch("app.api.common.routers.exceptions.logger", mock_logger):
            response = await handler(mock_request, exc)

        assert response.status_code == 400
        mock_logger.warning.assert_called_once()

    async def test_internal_api_error_uses_safe_message_and_custom_log_message(self) -> None:
        """Test that APIError subclasses can hide internal details from the client."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        exc = InternalServerError(log_message="Database invariant failed for category link")

        mock_logger = MagicMock()
        mock_logger.opt.return_value = mock_logger
        with patch("app.api.common.routers.exceptions.logger", mock_logger):
            response = await handler(mock_request, exc)

        body = json.loads(cast("bytes", response.body))
        assert body["detail"]["message"] == "Internal server error"
        mock_logger.error.assert_called_once_with("InternalServerError: Database invariant failed for category link")


@pytest.mark.unit
class TestRateLimitHandler:
    """Tests for rate_limit_handler."""

    def test_raises_type_error_for_non_rate_limit_exception(self) -> None:
        """Test TypeError raised when wrong exception type is passed (lines 50-52)."""
        mock_request = MagicMock()
        exc = RuntimeError("not a rate limit")

        with pytest.raises(TypeError, match="Rate limit handler called with wrong exception type"):
            rate_limit_handler(mock_request, exc)

    def test_delegates_to_slowapi_handler_for_rate_limit_exceeded(self) -> None:
        """Test that RateLimitExceeded is passed to _rate_limit_exceeded_handler (line 53)."""
        mock_request = MagicMock()
        exc = MagicMock(spec=RateLimitExceeded)

        with patch(
            "app.api.common.routers.exceptions._rate_limit_exceeded_handler", return_value=MagicMock()
        ) as mock_handler:
            rate_limit_handler(mock_request, exc)

        mock_handler.assert_called_once_with(mock_request, exc)


@pytest.mark.unit
class TestSharedExceptionFamilies:
    """Tests for shared common exception families exercising the full response path."""

    async def test_service_unavailable_error_with_details_is_exposed(self) -> None:
        """ServiceUnavailableError (503) includes message and details in the response body."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        exc = ServiceUnavailableError("Temporarily unavailable", details="redis offline")

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == 503
        body = json.loads(cast("bytes", response.body))
        assert body["detail"]["message"] == "Temporarily unavailable"
        assert body["detail"]["details"] == "redis offline"
