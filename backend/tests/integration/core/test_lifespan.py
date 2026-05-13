"""Integration tests for the FastAPI application lifespan."""

from __future__ import annotations

import asyncio
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import CloseError

from app.core import lifecycle
from app.core.config import Environment, settings
from app.core.database import async_engine
from app.core.runtime import AppServices

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture
def runtime_app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    """Return a fresh app with isolated storage settings for one lifespan test."""
    uploads_path = tmp_path / "uploads"
    monkeypatch.setattr(settings, "uploads_path", uploads_path)
    monkeypatch.setattr(settings, "file_storage_path", uploads_path / "files")
    monkeypatch.setattr(settings, "image_storage_path", uploads_path / "images")
    monkeypatch.setattr(settings, "environment", Environment.TESTING)

    app = FastAPI()
    app.state.services = AppServices()
    return app


@dataclass(slots=True)
class RuntimePatchConfig:
    """Overrides for patched runtime services."""

    redis: MagicMock | None = None
    blocking_redis: MagicMock | None = None
    email_checker: AsyncMock | None = None
    common_password_checker: AsyncMock | None = None
    file_cleanup_manager: MagicMock | None = None
    http_client: AsyncMock | None = None
    init_redis_side_effect: BaseException | type[BaseException] | None = None
    init_email_checker_side_effect: BaseException | type[BaseException] | None = None
    validate_scanner_side_effect: BaseException | type[BaseException] | None = None
    close_redis_side_effect: BaseException | type[BaseException] | None = None
    close_cache_side_effect: BaseException | type[BaseException] | None = None
    cleanup_manager_close_side_effect: BaseException | type[BaseException] | None = None
    http_client_close_side_effect: BaseException | type[BaseException] | None = None


@dataclass(slots=True)
class RuntimeMocks:
    """Mocks installed by patched_runtime_services."""

    redis: MagicMock
    blocking_redis: MagicMock | None
    email_checker: AsyncMock
    common_password_checker: AsyncMock
    camera_manager: MagicMock
    file_cleanup_manager: MagicMock
    http_client: AsyncMock
    init_redis: AsyncMock
    init_email_checker: AsyncMock
    init_common_password_checker: AsyncMock
    init_cache: MagicMock
    init_telemetry: MagicMock
    close_cache: AsyncMock
    close_redis: AsyncMock
    shutdown_telemetry: MagicMock
    cleanup_logging: AsyncMock
    validate_scanner: MagicMock
    ensure_storage: MagicMock
    mount_static: MagicMock
    register_favicon: MagicMock
    create_camera_connection_manager: MagicMock
    file_cleanup_cls: MagicMock
    create_http_client: MagicMock
    set_blocking_redis: MagicMock
    set_connection_manager: MagicMock


@contextmanager
def patched_runtime_services(config: RuntimePatchConfig | None = None) -> Iterator[RuntimeMocks]:
    """Patch external runtime services and expose the mocks used by a test."""
    config = RuntimePatchConfig() if config is None else config
    mock_redis = MagicMock() if config.redis is None else config.redis
    mock_blocking_redis = config.blocking_redis
    mock_email_checker = AsyncMock() if config.email_checker is None else config.email_checker
    mock_common_password_checker = (
        AsyncMock() if config.common_password_checker is None else config.common_password_checker
    )
    mock_camera_manager = MagicMock()

    mock_file_cleanup_manager = MagicMock() if config.file_cleanup_manager is None else config.file_cleanup_manager
    mock_file_cleanup_manager.initialize = AsyncMock()
    mock_file_cleanup_manager.close = AsyncMock(side_effect=config.cleanup_manager_close_side_effect)

    mock_http_client = AsyncMock() if config.http_client is None else config.http_client
    mock_http_client.aclose = AsyncMock(side_effect=config.http_client_close_side_effect)

    async def init_redis_side_effect(*, blocking: bool = False) -> MagicMock | None:
        if config.init_redis_side_effect is not None:
            raise config.init_redis_side_effect
        return mock_blocking_redis if blocking else mock_redis

    with (
        patch(
            "app.core.lifecycle.init_redis",
            side_effect=init_redis_side_effect,
        ) as init_redis,
        patch(
            "app.core.lifecycle.init_email_checker",
            return_value=mock_email_checker,
            side_effect=config.init_email_checker_side_effect,
        ) as init_email_checker,
        patch(
            "app.core.lifecycle.init_common_password_checker",
            return_value=mock_common_password_checker,
        ) as init_common,
        patch("app.core.lifecycle.init_cache") as init_cache,
        patch("app.core.lifecycle.init_telemetry") as init_telemetry,
        patch("app.core.lifecycle.close_cache", side_effect=config.close_cache_side_effect) as close_cache,
        patch("app.core.lifecycle.close_redis", side_effect=config.close_redis_side_effect) as close_redis,
        patch("app.core.lifecycle.shutdown_telemetry") as shutdown_telemetry,
        patch("app.core.lifecycle.cleanup_logging") as cleanup_logging,
        patch(
            "app.core.lifecycle.validate_malware_scanner_configuration",
            side_effect=config.validate_scanner_side_effect,
        ) as validate_scanner,
        patch("app.core.lifecycle.ensure_storage_directories") as ensure_storage,
        patch("app.core.lifecycle.mount_static_directories") as mount_static,
        patch("app.core.lifecycle.register_favicon_route") as register_favicon,
        patch("app.core.lifecycle.create_camera_connection_manager", return_value=mock_camera_manager) as create_camera,
        patch("app.core.lifecycle.FileCleanupManager", return_value=mock_file_cleanup_manager) as file_cleanup_cls,
        patch("app.core.lifecycle.create_http_client", return_value=mock_http_client) as create_http_client,
        patch("app.core.lifecycle.set_blocking_redis") as set_blocking_redis,
        patch("app.core.lifecycle.set_connection_manager") as set_connection_manager,
    ):
        yield RuntimeMocks(
            redis=mock_redis,
            blocking_redis=mock_blocking_redis,
            email_checker=mock_email_checker,
            common_password_checker=mock_common_password_checker,
            camera_manager=mock_camera_manager,
            file_cleanup_manager=mock_file_cleanup_manager,
            http_client=mock_http_client,
            init_redis=init_redis,
            init_email_checker=init_email_checker,
            init_common_password_checker=init_common,
            init_cache=init_cache,
            init_telemetry=init_telemetry,
            close_cache=close_cache,
            close_redis=close_redis,
            shutdown_telemetry=shutdown_telemetry,
            cleanup_logging=cleanup_logging,
            validate_scanner=validate_scanner,
            ensure_storage=ensure_storage,
            mount_static=mount_static,
            register_favicon=register_favicon,
            create_camera_connection_manager=create_camera,
            file_cleanup_cls=file_cleanup_cls,
            create_http_client=create_http_client,
            set_blocking_redis=set_blocking_redis,
            set_connection_manager=set_connection_manager,
        )


class TestLifespan:
    """Application lifespan startup and shutdown."""

    async def test_startup_sets_runtime_services_on_app_state(self, runtime_app: FastAPI) -> None:
        """Startup should populate the typed runtime container."""
        with patched_runtime_services() as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                services = runtime_app.state.services
                assert isinstance(services, AppServices)
                assert services.redis is runtime.redis
                assert services.email_checker is runtime.email_checker
                assert services.common_password_checker is runtime.common_password_checker

        assert runtime.init_redis.await_args_list[0].kwargs == {}
        assert runtime.init_redis.await_args_list[1].kwargs == {"blocking": True}
        runtime.init_email_checker.assert_awaited_once_with(runtime.redis)
        runtime.init_common_password_checker.assert_awaited_once_with(runtime.redis)

    async def test_startup_initializes_storage_on_app_state(self, runtime_app: FastAPI) -> None:
        """Startup should ensure storage, mount static files, and mark storage ready."""
        with patched_runtime_services() as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                assert runtime_app.state.services.storage_ready is True

        runtime.ensure_storage.assert_called_once()
        runtime.mount_static.assert_called_once_with(runtime_app)
        runtime.register_favicon.assert_called_once_with(runtime_app)

    async def test_shutdown_closes_email_checker_and_redis(self, runtime_app: FastAPI) -> None:
        """Shutdown should close Redis-backed services."""
        with patched_runtime_services() as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.email_checker.close.assert_awaited_once()
        runtime.close_redis.assert_any_await(runtime.redis)

    async def test_shutdown_tolerates_email_checker_close_error(self, runtime_app: FastAPI) -> None:
        """An expected email checker close error should not prevent Redis cleanup."""
        email_checker = AsyncMock()
        email_checker.close.side_effect = RuntimeError("checker gone")

        with patched_runtime_services(RuntimePatchConfig(email_checker=email_checker)) as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.close_redis.assert_any_await(runtime.redis)

    async def test_shutdown_tolerates_redis_close_error(self, runtime_app: FastAPI) -> None:
        """An expected Redis close error should not propagate out of the lifespan."""
        with patched_runtime_services(RuntimePatchConfig(close_redis_side_effect=ConnectionError("redis gone"))):
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

    async def test_shutdown_tolerates_file_cleanup_manager_cancellation(self, runtime_app: FastAPI) -> None:
        """A cancelled cleanup manager close should not prevent HTTP client cleanup."""
        config = RuntimePatchConfig(cleanup_manager_close_side_effect=asyncio.CancelledError())
        with patched_runtime_services(config) as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.file_cleanup_manager.close.assert_awaited_once()
        runtime.http_client.aclose.assert_awaited_once()

    async def test_shutdown_tolerates_http_client_close_error(self, runtime_app: FastAPI) -> None:
        """A CloseError from the shared HTTP client should not prevent shutdown."""
        with patched_runtime_services(
            RuntimePatchConfig(http_client_close_side_effect=CloseError("client gone"))
        ) as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.file_cleanup_manager.close.assert_awaited_once()
        runtime.http_client.aclose.assert_awaited_once()

    async def test_startup_initializes_telemetry(self, runtime_app: FastAPI) -> None:
        """Startup should invoke telemetry initialization with the shared async engine."""
        with patched_runtime_services() as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.init_telemetry.assert_called_once_with(runtime_app, async_engine)

    async def test_shutdown_shuts_down_telemetry(self, runtime_app: FastAPI) -> None:
        """Shutdown should uninstrument telemetry even when no exporter is enabled."""
        with patched_runtime_services() as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.close_cache.assert_awaited_once()
        runtime.shutdown_telemetry.assert_called_once_with(runtime_app)

    async def test_startup_failure_cleans_up_initialized_services(self, runtime_app: FastAPI) -> None:
        """A later startup failure should close services initialized earlier."""
        config = RuntimePatchConfig(validate_scanner_side_effect=RuntimeError("bad scan config"))
        with (
            patched_runtime_services(config) as runtime,
            pytest.raises(RuntimeError, match="bad scan config"),
        ):
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.email_checker.close.assert_awaited_once()
        runtime.close_cache.assert_awaited_once()
        runtime.close_redis.assert_any_await(runtime.redis)
        assert isinstance(runtime_app.state.services, AppServices)
        assert runtime_app.state.services.redis is None

    async def test_startup_failure_preserves_original_error_when_cleanup_fails(self, runtime_app: FastAPI) -> None:
        """Cleanup failures during failed startup should not replace the startup exception."""
        config = RuntimePatchConfig(
            validate_scanner_side_effect=RuntimeError("bad scan config"),
            close_cache_side_effect=ValueError("cache cleanup failed"),
        )
        with (
            patched_runtime_services(config) as runtime,
            pytest.raises(RuntimeError, match="bad scan config"),
        ):
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.close_cache.assert_awaited_once()
        runtime.close_redis.assert_any_await(runtime.redis)

    async def test_unexpected_shutdown_error_still_runs_later_cleanup(self, runtime_app: FastAPI) -> None:
        """Unexpected shutdown errors should be raised after all cleanup is attempted."""
        config = RuntimePatchConfig(close_cache_side_effect=ValueError("cache exploded"))
        with (
            patched_runtime_services(config) as runtime,
            pytest.raises(ValueError, match="cache exploded"),
        ):
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.file_cleanup_manager.close.assert_awaited_once()
        runtime.http_client.aclose.assert_awaited_once()
        runtime.shutdown_telemetry.assert_called_once_with(runtime_app)

    async def test_startup_failure_cleans_up_logging_when_configured(
        self,
        runtime_app: FastAPI,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Logging initialized before startup should be cleaned up when startup fails."""
        monkeypatch.setattr(settings, "environment", Environment.DEV)

        with (
            patch("app.core.lifecycle.setup_logging") as setup_logging,
            patched_runtime_services(
                RuntimePatchConfig(init_redis_side_effect=RuntimeError("redis unavailable"))
            ) as runtime,
            pytest.raises(RuntimeError, match="redis unavailable"),
        ):
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        setup_logging.assert_called_once()
        runtime.cleanup_logging.assert_awaited_once()

    async def test_startup_cancellation_cleans_up_initialized_services(self, runtime_app: FastAPI) -> None:
        """Cancellation during startup should still close services initialized earlier."""
        config = RuntimePatchConfig(init_email_checker_side_effect=asyncio.CancelledError())
        with (
            patched_runtime_services(config) as runtime,
            pytest.raises(asyncio.CancelledError),
        ):
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        runtime.close_cache.assert_awaited_once()
        runtime.close_redis.assert_any_await(runtime.redis)
        assert isinstance(runtime_app.state.services, AppServices)
        assert runtime_app.state.services.redis is None

    async def test_shutdown_clears_global_runtime_hooks(self, runtime_app: FastAPI) -> None:
        """Shutdown should clear module-level globals that point at runtime resources."""
        blocking_redis = MagicMock()

        with patched_runtime_services(RuntimePatchConfig(blocking_redis=blocking_redis)) as runtime:
            async with lifecycle.runtime_lifespan(runtime_app):
                pass

        assert runtime.set_blocking_redis.call_args_list[-1].args == (None,)
        assert runtime.set_connection_manager.call_args_list[-1].args == (None,)

    async def test_clearing_runtime_hooks_does_not_import_connection_manager(self) -> None:
        """Clearing globals should stay dependency-light for failed startup cleanup."""
        sys.modules.pop("app.api.plugins.rpi_cam.websocket.connection_manager", None)

        lifecycle.set_connection_manager(None)

        assert "app.api.plugins.rpi_cam.websocket.connection_manager" not in sys.modules
