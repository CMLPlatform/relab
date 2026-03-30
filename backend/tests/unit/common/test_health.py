"""Unit tests for health check endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.api.common.routers.health import (
    HEALTHY_STATUS,
    UNHEALTHY_STATUS,
    check_database,
    check_redis,
    healthy_check,
    perform_health_checks,
    unhealthy_check,
)


@pytest.mark.unit
class TestHealthCheckHelpers:
    """Tests for health check helper functions."""

    def test_healthy_check_returns_correct_payload(self) -> None:
        """Test that healthy_check returns the expected dict."""
        result = healthy_check()
        assert result == {"status": HEALTHY_STATUS}

    def test_unhealthy_check_returns_correct_payload(self) -> None:
        """Test that unhealthy_check includes status and error."""
        result = unhealthy_check("db connection refused")
        assert result["status"] == UNHEALTHY_STATUS
        assert result["error"] == "db connection refused"


@pytest.mark.unit
class TestCheckDatabase:
    """Tests for check_database function."""

    async def test_database_healthy(self) -> None:
        """Test healthy result when DB returns SELECT 1."""
        mock_conn = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 1
        mock_conn.execute = AsyncMock(return_value=mock_result)

        mock_engine_ctx = AsyncMock()
        mock_engine_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_engine_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("app.api.common.routers.health.async_engine") as mock_engine:
            mock_engine.connect.return_value = mock_engine_ctx
            result = await check_database()

        assert result["status"] == HEALTHY_STATUS

    async def test_database_unexpected_result(self) -> None:
        """Test unhealthy result when SELECT 1 returns wrong value."""
        mock_conn = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = 0  # Wrong value
        mock_conn.execute = AsyncMock(return_value=mock_result)

        mock_engine_ctx = AsyncMock()
        mock_engine_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_engine_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("app.api.common.routers.health.async_engine") as mock_engine:
            mock_engine.connect.return_value = mock_engine_ctx
            result = await check_database()

        assert result["status"] == UNHEALTHY_STATUS
        assert "unexpected" in result["error"].lower()

    async def test_database_connection_error(self) -> None:
        """Test unhealthy result when DB raises an exception."""
        mock_engine_ctx = AsyncMock()
        mock_engine_ctx.__aenter__ = AsyncMock(side_effect=SQLAlchemyError("connection refused"))
        mock_engine_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("app.api.common.routers.health.async_engine") as mock_engine:
            mock_engine.connect.return_value = mock_engine_ctx
            result = await check_database()

        assert result["status"] == UNHEALTHY_STATUS
        assert result["error"] == "Database connection failed"


@pytest.mark.unit
class TestCheckRedis:
    """Tests for check_redis function."""

    async def test_redis_healthy(self) -> None:
        """Test healthy result when Redis ping succeeds."""
        mock_redis = AsyncMock()
        request = MagicMock()
        request.app.state.redis = mock_redis

        with patch("app.api.common.routers.health.ping_redis", return_value=True):
            result = await check_redis(request)

        assert result["status"] == HEALTHY_STATUS

    async def test_redis_ping_returns_false(self) -> None:
        """Test unhealthy result when ping returns False."""
        mock_redis = AsyncMock()
        request = MagicMock()
        request.app.state.redis = mock_redis

        with patch("app.api.common.routers.health.ping_redis", return_value=False):
            result = await check_redis(request)

        assert result["status"] == UNHEALTHY_STATUS
        assert "False" in result["error"]

    async def test_redis_not_initialized(self) -> None:
        """Test unhealthy result when Redis client is not set."""
        request = MagicMock()
        del request.app.state.redis  # Remove redis attribute

        result = await check_redis(request)

        assert result["status"] == UNHEALTHY_STATUS
        assert "not initialized" in result["error"]

    async def test_redis_connection_error(self) -> None:
        """Test unhealthy result when Redis raises an exception."""
        mock_redis = AsyncMock()
        request = MagicMock()
        request.app.state.redis = mock_redis

        with patch("app.api.common.routers.health.ping_redis", side_effect=OSError("connection refused")):
            result = await check_redis(request)

        assert result["status"] == UNHEALTHY_STATUS
        assert result["error"] == "Redis connection failed"


@pytest.mark.unit
class TestPerformHealthChecks:
    """Tests for perform_health_checks."""

    async def test_all_healthy(self) -> None:
        """Test that all checks pass through correctly."""
        request = MagicMock()
        healthy = {"status": HEALTHY_STATUS}

        with (
            patch("app.api.common.routers.health.check_database", return_value=healthy),
            patch("app.api.common.routers.health.check_redis", return_value=healthy),
        ):
            result = await perform_health_checks(request)

        assert result["database"]["status"] == HEALTHY_STATUS
        assert result["redis"]["status"] == HEALTHY_STATUS

    async def test_one_unhealthy(self) -> None:
        """Test that an unhealthy check is included in results."""
        request = MagicMock()
        healthy = {"status": HEALTHY_STATUS}
        unhealthy = {"status": UNHEALTHY_STATUS, "error": "down"}

        with (
            patch("app.api.common.routers.health.check_database", return_value=healthy),
            patch("app.api.common.routers.health.check_redis", return_value=unhealthy),
        ):
            result = await perform_health_checks(request)

        assert result["database"]["status"] == HEALTHY_STATUS
        assert result["redis"]["status"] == UNHEALTHY_STATUS
