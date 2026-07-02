"""Unit tests for health check endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.exc import SQLAlchemyError

from app.api.common.routers.health import (
    HEALTHY_STATUS,
    UNHEALTHY_STATUS,
    check_database,
    check_redis,
    perform_health_checks,
)
from app.core.runtime import AppServices


async def test_database_healthy() -> None:
    """Test healthy result when database verification succeeds."""
    with patch("app.api.common.routers.health.check_database_connection", new=AsyncMock()):
        result = await check_database()

    assert result["status"] == HEALTHY_STATUS
    assert result["component"] == "database"

async def test_database_connection_error() -> None:
    """Test unhealthy result when database verification raises."""
    with patch(
        "app.api.common.routers.health.check_database_connection",
        new=AsyncMock(side_effect=SQLAlchemyError("connection refused")),
    ):
        result = await check_database()

    assert result["status"] == UNHEALTHY_STATUS
    assert result["component"] == "database"
    assert result["error"] == "Database connection failed"

async def test_redis_healthy() -> None:
    """Test healthy result when Redis ping succeeds."""
    mock_redis = AsyncMock()
    request = MagicMock()
    request.app.state.services = AppServices(redis=mock_redis)

    with patch("app.api.common.routers.health.ping_redis", return_value=True):
        result = await check_redis(request)

    assert result["status"] == HEALTHY_STATUS
    assert result["component"] == "redis"

async def test_redis_ping_returns_false() -> None:
    """Test unhealthy result when ping returns False."""
    mock_redis = AsyncMock()
    request = MagicMock()
    request.app.state.services = AppServices(redis=mock_redis)

    with patch("app.api.common.routers.health.ping_redis", return_value=False):
        result = await check_redis(request)

    assert result["status"] == UNHEALTHY_STATUS
    assert result["component"] == "redis"
    assert "False" in result["error"]

async def test_redis_not_initialized() -> None:
    """Test unhealthy result when Redis client is not set."""
    request = MagicMock()
    request.app.state.services = AppServices()

    result = await check_redis(request)

    assert result["status"] == UNHEALTHY_STATUS
    assert result["component"] == "redis"
    assert "not initialized" in result["error"]

async def test_redis_connection_error() -> None:
    """Test unhealthy result when Redis raises an exception."""
    mock_redis = AsyncMock()
    request = MagicMock()
    request.app.state.services = AppServices(redis=mock_redis)

    with patch("app.api.common.routers.health.ping_redis", side_effect=OSError("connection refused")):
        result = await check_redis(request)

    assert result["status"] == UNHEALTHY_STATUS
    assert result["component"] == "redis"
    assert result["error"] == "Redis connection failed"

async def test_all_healthy() -> None:
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

async def test_one_unhealthy() -> None:
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

