"""Application lifecycle orchestration for runtime services.

Core owns generic infrastructure (logging, database, Redis, cache, HTTP client,
telemetry, static mounts). Domain modules contribute their own startup/shutdown
via ``DomainLifecycle`` hooks, wired together in the composition root (main.py),
and park their own services in ``AppServices.extras`` — core never imports
domain code.
"""

import inspect
import logging
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import FastAPI
from httpx import CloseError

from app.core.cache import close_cache, init_cache
from app.core.clients import create_http_client
from app.core.config import Environment, settings
from app.core.database import async_engine, check_database_connection, close_async_engine
from app.core.logging import cleanup_logging, setup_logging
from app.core.redis import close_redis, init_redis
from app.core.runtime import AppServices, get_app_services, reset_app_services
from app.core.secrets import warn_on_placeholder_secrets
from app.core.static import mount_static_directories, register_favicon_route
from app.core.telemetry import init_telemetry, shutdown_telemetry

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Awaitable, Callable, Sequence

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    ShutdownClose = Callable[[], Awaitable[None] | None]


@dataclass(frozen=True, slots=True)
class ShutdownStep:
    """One runtime cleanup action and the failures it may tolerate."""

    label: str
    close: ShutdownClose | None
    expected_errors: tuple[type[BaseException], ...] = ()


@dataclass(frozen=True, slots=True)
class DomainLifecycle:
    """Startup/shutdown contributed by one domain module.

    ``startup`` runs after core services (database, Redis, cache) are ready.
    ``shutdown_steps`` returns the domain's cleanup actions; they run before
    core services shut down, in reverse registration order.
    """

    name: str
    startup: Callable[[FastAPI, AppServices], Awaitable[None]]
    shutdown_steps: Callable[[FastAPI, AppServices], tuple[ShutdownStep, ...]]


def log_startup_configuration() -> None:
    """Log key startup configuration values."""
    logger.info("Starting up application...")
    logger.info(
        "Security config: allowed_hosts=%s allowed_origins=%s cors_origin_regex=%s",
        settings.allowed_hosts,
        settings.allowed_origins,
        settings.cors_origin_regex,
    )
    warn_on_placeholder_secrets(logger, settings)


def ensure_storage_directories() -> None:
    """Create configured storage directories and verify they are writable."""
    for path in [settings.file_storage_path, settings.image_storage_path]:
        path.mkdir(parents=True, exist_ok=True)
        try:
            with tempfile.NamedTemporaryFile(dir=path, prefix=".write-test-", delete=True):
                pass
        except OSError as e:
            msg = f"Storage path is not writable: {path}"
            raise RuntimeError(msg) from e


async def _initialize_cache_services(services: AppServices) -> None:
    """Initialize Redis and the endpoint cache."""
    services.redis = await init_redis()
    init_cache(services.redis)


def _initialize_storage_mounts(app: FastAPI) -> None:
    """Prepare storage directories and static file mounts."""
    ensure_storage_directories()
    mount_static_directories(app)
    register_favicon_route(app)


def _initialize_http_and_observability(app: FastAPI, services: AppServices) -> None:
    """Initialize shared HTTP and observability services."""
    services.http_client = create_http_client()
    init_telemetry(app, async_engine)


async def initialize_runtime_services(app: FastAPI, domains: Sequence[DomainLifecycle]) -> AppServices:
    """Create and initialize all long-lived runtime services."""
    services = reset_app_services(app)
    try:
        await check_database_connection()
        await _initialize_cache_services(services)
        for domain in domains:
            await domain.startup(app, services)
        _initialize_storage_mounts(app)
        _initialize_http_and_observability(app, services)
    except BaseException:
        await shutdown_runtime_services(app, domains, raise_unexpected=False)
        raise
    else:
        logger.info("Application services initialized")
        return services


async def _close_redis_client(redis_client: Redis | None) -> None:
    if redis_client is None:
        return
    await close_redis(redis_client)


async def _run_shutdown_step(
    step: ShutdownStep,
) -> Exception | None:
    """Run one shutdown step and return unexpected failures after logging them.

    Only ``Exception`` is caught: cancellation and interrupts must propagate
    immediately instead of being deferred behind the remaining steps.
    """
    if step.close is None:
        return None
    try:
        result = step.close()
        if inspect.isawaitable(result):
            await result
    except step.expected_errors as e:
        logger.warning("Error closing %s: %s", step.label, e)
    except Exception as e:
        logger.exception("Unexpected error closing %s", step.label)
        return e
    return None


def _core_shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:
    """Return core runtime cleanup steps in shutdown order."""
    return (
        ShutdownStep(
            label="endpoint cache",
            close=close_cache,
            expected_errors=(RuntimeError,),
        ),
        ShutdownStep(
            label="primary Redis client",
            close=lambda: _close_redis_client(services.redis),
            expected_errors=(ConnectionError, OSError),
        ),
        ShutdownStep(
            label="outbound HTTP client",
            close=services.http_client.aclose if services.http_client is not None else None,
            expected_errors=(CloseError,),
        ),
        ShutdownStep(label="telemetry", close=lambda: shutdown_telemetry(app)),
        ShutdownStep(
            label="database engine",
            close=close_async_engine,
            expected_errors=(RuntimeError, OSError),
        ),
    )


async def shutdown_runtime_services(
    app: FastAPI,
    domains: Sequence[DomainLifecycle],
    *,
    raise_unexpected: bool = True,
) -> None:
    """Shutdown and clear all runtime services (domain steps first, then core)."""
    services = get_app_services(app)
    unexpected_errors: list[Exception] = []
    try:
        steps: list[ShutdownStep] = []
        for domain in reversed(domains):
            steps.extend(domain.shutdown_steps(app, services))
        steps.extend(_core_shutdown_steps(app, services))
        for step in steps:
            if error := await _run_shutdown_step(step):
                unexpected_errors.extend([error])
    finally:
        reset_app_services(app)
    if unexpected_errors and raise_unexpected:
        raise unexpected_errors[0]


@asynccontextmanager
async def runtime_lifespan(app: FastAPI, domains: Sequence[DomainLifecycle]) -> AsyncGenerator[None]:
    """Manage application startup and shutdown for the FastAPI lifespan."""
    logging_configured = False
    startup_complete = False

    try:
        if settings.environment != Environment.TESTING:
            setup_logging()
            logging_configured = True

        log_startup_configuration()
        await initialize_runtime_services(app, domains)
        startup_complete = True
        logger.info("Application startup complete")
        yield
    finally:
        try:
            if startup_complete:
                logger.info("Shutting down application...")
                await shutdown_runtime_services(app, domains)
                logger.info("Application shutdown complete")
        finally:
            if logging_configured:
                await cleanup_logging()
