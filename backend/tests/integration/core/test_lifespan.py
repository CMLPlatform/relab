"""Integration tests for the FastAPI application lifespan.

Verifies that startup initialises app.state correctly and that shutdown
calls the expected close methods.  External services (Redis, email checker)
are mocked so these tests run without any real infrastructure.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import CloseError

from app.core.config import settings
from app.core.database import async_engine
from app.main import app, lifespan

if TYPE_CHECKING:
    from collections.abc import Generator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _reset_app_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Start each lifespan test with a clean app.state."""
    uploads_path = tmp_path / "uploads"
    file_storage_path = uploads_path / "files"
    image_storage_path = uploads_path / "images"

    monkeypatch.setattr(settings, "uploads_path", uploads_path)
    monkeypatch.setattr(settings, "file_storage_path", file_storage_path)
    monkeypatch.setattr(settings, "image_storage_path", image_storage_path)

    app.state.redis = None
    app.state.email_checker = None
    app.state.blocking_redis = None
    app.state.camera_connection_manager = None
    app.state.file_cleanup_manager = None
    app.state.http_client = None
    yield
    app.state.redis = None
    app.state.email_checker = None
    app.state.blocking_redis = None
    app.state.camera_connection_manager = None
    app.state.file_cleanup_manager = None
    app.state.http_client = None


@pytest.mark.integration
class TestLifespan:
    """Application lifespan startup and shutdown."""

    async def test_startup_sets_redis_on_app_state(self) -> None:
        """After startup, app.state.redis must be populated."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis) as mock_init_redis,
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                assert app.state.redis is mock_redis
            mock_init_redis.assert_awaited_once()

    async def test_startup_sets_email_checker_on_app_state(self) -> None:
        """After startup, app.state.email_checker must be populated."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker) as mock_init_checker,
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                assert app.state.email_checker is mock_email_checker
            mock_init_checker.assert_awaited_once_with(mock_redis)

    async def test_startup_initializes_storage_on_app_state(self) -> None:
        """After startup, storage must be ensured and state marked ready."""
        with (
            patch("app.main.init_redis"),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker"),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
            patch("app.main.ensure_storage_directories") as mock_ensure,
            patch("app.main.mount_static_directories") as mock_mount,
            patch("app.main.register_favicon_route") as mock_favicon,
        ):
            async with lifespan(app):
                assert app.state.storage_ready is True

            mock_ensure.assert_called_once()
            mock_mount.assert_called_once_with(app)
            mock_favicon.assert_called_once_with(app)

    async def test_shutdown_closes_email_checker(self) -> None:
        """On shutdown, email_checker.close() must be awaited."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                pass  # allow shutdown to run

        mock_email_checker.close.assert_awaited_once()

    async def test_shutdown_closes_redis(self) -> None:
        """On shutdown, close_redis() must be called with the Redis instance."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis") as mock_close_redis,
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                pass

        mock_close_redis.assert_awaited_once_with(mock_redis)

    async def test_shutdown_tolerates_email_checker_close_error(self) -> None:
        """A RuntimeError from email_checker.close() must not prevent shutdown from completing."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()
        mock_email_checker.close.side_effect = RuntimeError("checker gone")

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis") as mock_close_redis,
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                pass  # shutdown runs even if close() raised

        # Redis must still be closed despite the earlier error
        mock_close_redis.assert_awaited_once()

    async def test_shutdown_tolerates_redis_close_error(self) -> None:
        """A ConnectionError from close_redis() must not propagate out of the lifespan."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis", side_effect=ConnectionError("redis gone")),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            # Must not raise
            async with lifespan(app):
                pass

    async def test_shutdown_tolerates_file_cleanup_manager_cancellation(self) -> None:
        """A cancelled file cleanup manager close must not prevent shutdown."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()
        mock_file_cleanup_manager = MagicMock()
        mock_file_cleanup_manager.initialize = AsyncMock()
        mock_file_cleanup_manager.close = AsyncMock(side_effect=asyncio.CancelledError())
        mock_http_client = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
            patch("app.main.FileCleanupManager", return_value=mock_file_cleanup_manager),
            patch("app.main.create_http_client", return_value=mock_http_client),
        ):
            async with lifespan(app):
                pass

        mock_file_cleanup_manager.close.assert_awaited_once()
        mock_http_client.aclose.assert_awaited_once()

    async def test_shutdown_tolerates_http_client_close_error(self) -> None:
        """A CloseError from the shared HTTP client must not prevent shutdown."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()
        mock_file_cleanup_manager = MagicMock()
        mock_file_cleanup_manager.initialize = AsyncMock()
        mock_file_cleanup_manager.close = AsyncMock()
        mock_http_client = AsyncMock()
        mock_http_client.aclose.side_effect = CloseError("client gone")

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
            patch("app.main.FileCleanupManager", return_value=mock_file_cleanup_manager),
            patch("app.main.create_http_client", return_value=mock_http_client),
        ):
            async with lifespan(app):
                pass

        mock_file_cleanup_manager.close.assert_awaited_once()
        mock_http_client.aclose.assert_awaited_once()

    async def test_startup_initializes_telemetry(self) -> None:
        """Startup should invoke telemetry initialization with the shared async engine."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry") as mock_init_telemetry,
            patch("app.main.close_fastapi_cache"),
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry"),
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                pass

        mock_init_telemetry.assert_called_once_with(app, async_engine)

    async def test_shutdown_shuts_down_telemetry(self) -> None:
        """Shutdown should uninstrument telemetry even when no exporter is enabled."""
        mock_redis = MagicMock()
        mock_email_checker = AsyncMock()

        with (
            patch("app.main.init_redis", return_value=mock_redis),
            patch("app.main.init_blocking_redis", return_value=None),
            patch("app.main.init_email_checker", return_value=mock_email_checker),
            patch("app.main.init_fastapi_cache"),
            patch("app.main.init_telemetry"),
            patch("app.main.close_fastapi_cache") as mock_close_fastapi_cache,
            patch("app.main.close_redis"),
            patch("app.main.shutdown_telemetry") as mock_shutdown_telemetry,
            patch("app.main.cleanup_logging"),
        ):
            async with lifespan(app):
                pass

        mock_close_fastapi_cache.assert_awaited_once()
        mock_shutdown_telemetry.assert_called_once_with(app)
