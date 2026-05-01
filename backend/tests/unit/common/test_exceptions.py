"""Unit tests for common exception handlers."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException, status

from app.api.auth.services.rate_limiter import RateLimitExceededError, rate_limit_exceeded_handler
from app.api.common.exceptions import (
    APIError,
    InternalServerError,
    ServiceUnavailableError,
)
from app.api.common.routers.exceptions import create_exception_handler, register_exception_handlers


class TestCreateExceptionHandler:
    """Tests for create_exception_handler."""

    async def test_api_error_without_details(self) -> None:
        """Test that APIError without details returns correct JSON response."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        mock_request.state.request_id = "req-123"
        exc = APIError("Not found")
        exc.http_status_code = status.HTTP_404_NOT_FOUND

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == 404

        body = json.loads(bytes(response.body))
        assert body["detail"] == "Not found"
        assert body["request_id"] == "req-123"
        assert body["code"] == "APIError"
        assert "errors" not in body

    async def test_api_error_with_details(self) -> None:
        """Test that APIError with details includes them in response (line 30)."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        mock_request.state.request_id = "req-456"
        exc = APIError("Bad input", details="field value is wrong")
        exc.http_status_code = status.HTTP_400_BAD_REQUEST

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        body = json.loads(bytes(response.body))
        assert body["detail"] == "Bad input"
        assert body["errors"] == "field value is wrong"

    async def test_server_error_logs_at_error_level(self) -> None:
        """Test that 5xx errors are logged with exception information."""
        handler = create_exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR)
        mock_request = MagicMock()
        mock_request.state.request_id = "req-500"
        exc = RuntimeError("Something broke")

        mock_logger = MagicMock()
        with patch("app.api.common.routers.exceptions.logger", mock_logger):
            response = await handler(mock_request, exc)

        assert response.status_code == 500
        mock_logger.error.assert_called_once_with(
            "%s: %s",
            "RuntimeError",
            "Something broke",
            exc_info=(RuntimeError, exc, exc.__traceback__),
        )

        body = json.loads(bytes(response.body))
        assert body["detail"] == "Internal server error"
        assert body["request_id"] == "req-500"

    async def test_400_error_logs_at_warning_level(self) -> None:
        """Test that 4xx (non-404) errors are logged at warning level."""
        handler = create_exception_handler(status.HTTP_400_BAD_REQUEST)
        mock_request = MagicMock()
        mock_request.state.request_id = "req-400"
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
        mock_request.state.request_id = "req-internal"
        exc = InternalServerError(log_message="Database invariant failed for category link")

        mock_logger = MagicMock()
        with patch("app.api.common.routers.exceptions.logger", mock_logger):
            response = await handler(mock_request, exc)

        body = json.loads(bytes(response.body))
        assert body["detail"] == "Internal server error"
        mock_logger.error.assert_called_once_with(
            "%s: %s",
            "InternalServerError",
            "Database invariant failed for category link",
            exc_info=(InternalServerError, exc, exc.__traceback__),
        )

    async def test_http_exception_404_returns_problem_details_with_detail(self) -> None:
        """HTTPException 404 returns Problem Details and preserves its public detail."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        mock_request.state.request_id = "req-http-404"
        exc = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource missing")

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.media_type == "application/problem+json"
        body = json.loads(bytes(response.body))
        assert body["detail"] == "Resource missing"
        assert body["code"] == "HTTPException"
        assert body["request_id"] == "req-http-404"

    async def test_http_exception_500_returns_generic_problem_details(self) -> None:
        """HTTPException 500 hides its detail from clients."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        mock_request.state.request_id = "req-http-500"
        exc = HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="database path /srv/db")

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        body = json.loads(bytes(response.body))
        assert body["detail"] == "Internal server error"
        assert "database path" not in bytes(response.body).decode()

    async def test_api_error_5xx_suppresses_details_in_response(self) -> None:
        """APIError details on 5xx are kept out of the response body."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        mock_request.state.request_id = "req-api-500"
        exc = ServiceUnavailableError("Temporarily unavailable", details="redis://internal-cache:6379/0")

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        body = json.loads(bytes(response.body))
        assert body["detail"] == "Temporarily unavailable"
        assert "errors" not in body
        assert "redis://internal-cache" not in bytes(response.body).decode()


class TestRegisterExceptionHandlers:
    """Tests for app-wide exception handler registration."""

    def test_registers_catch_all_exception_handler(self) -> None:
        """Plain Exception is registered for centralized generic 500 responses."""
        app = FastAPI()

        register_exception_handlers(app)

        assert Exception in app.exception_handlers


class TestRateLimitExceededHandler:
    """Tests for rate_limit_exceeded_handler."""

    def test_returns_429_with_detail(self) -> None:
        """Test that handler returns a 429 JSON response."""
        mock_request = MagicMock()
        exc = RateLimitExceededError()

        response = rate_limit_exceeded_handler(mock_request, exc)

        assert response.status_code == 429
        body = json.loads(bytes(response.body))
        assert body["detail"] == "Rate limit exceeded"
        assert body["status"] == 429

    def test_custom_detail_message(self) -> None:
        """Test that a custom detail message is forwarded."""
        mock_request = MagicMock()
        exc = RateLimitExceededError("Too many login attempts")

        response = rate_limit_exceeded_handler(mock_request, exc)

        body = json.loads(bytes(response.body))
        assert body["detail"] == "Too many login attempts"
        assert body["code"] == "RateLimitExceeded"


class TestSharedExceptionFamilies:
    """Tests for shared common exception families exercising the full response path."""

    async def test_service_unavailable_error_with_details_hides_errors(self) -> None:
        """ServiceUnavailableError (503) keeps internal details out of the response body."""
        handler = create_exception_handler()
        mock_request = MagicMock()
        mock_request.state.request_id = "req-503"
        exc = ServiceUnavailableError("Temporarily unavailable", details="redis offline")

        with patch("app.api.common.routers.exceptions.logger"):
            response = await handler(mock_request, exc)

        assert response.status_code == 503
        body = json.loads(bytes(response.body))
        assert body["detail"] == "Temporarily unavailable"
        assert "errors" not in body
