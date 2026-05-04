"""Main application entrypoint for the Reverse Engineering Lab backend."""

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_pagination import add_pagination
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.auth.routers.frontend import router as frontend_router
from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.health import router as health_router
from app.api.common.routers.main import router as api_router
from app.api.common.routers.openapi import init_openapi_docs
from app.core import lifecycle
from app.core.config import settings
from app.core.config.models import Environment
from app.core.logging import cleanup_logging, setup_logging
from app.core.middleware import (
    register_content_negotiation_middleware,
    register_request_id_middleware,
    register_request_size_limit_middleware,
    register_response_policy_middleware,
)

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Manage application lifespan: startup and shutdown events."""
    logging_configured = False
    if settings.environment != Environment.TESTING:
        setup_logging()
        logging_configured = True

    lifecycle.log_startup_configuration()
    await lifecycle.initialize_runtime_services(app)
    logger.info("Application startup complete")

    yield

    logger.info("Shutting down application...")
    await lifecycle.shutdown_runtime_services(app)
    logger.info("Application shutdown complete")
    if logging_configured:
        await cleanup_logging()


def create_app() -> FastAPI:
    """Create and configure a FastAPI application instance."""
    app = FastAPI(
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )

    # Add request ID propagation and request access logging
    register_request_id_middleware(app)

    # Enforce lean REST media type negotiation on API routes.
    register_content_negotiation_middleware(app)

    # Add global non-multipart request body size limits
    register_request_size_limit_middleware(app)

    # Add host header validation middleware
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.allowed_hosts,
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    # Add response policy last so it wraps framework-level responses too.
    register_response_policy_middleware(
        app,
        enable_hsts=settings.environment in {Environment.STAGING, Environment.PROD},
    )

    # Include health check routes (liveness and readiness probes)
    app.include_router(health_router)

    # Include unversioned browser pages separately from the API contract.
    app.include_router(frontend_router)

    # Include the canonical versioned API contract.
    app.include_router(api_router, prefix="/v1")

    # Initialize OpenAPI documentation
    init_openapi_docs(app)

    # Initialize exception handling
    register_exception_handlers(app)

    # Add pagination
    add_pagination(app)
    return app


# Initialize FastAPI application with lifespan
app = create_app()
