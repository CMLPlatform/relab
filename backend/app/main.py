"""Main application entrypoint for the Reverse Engineering Lab backend."""

from fastapi import FastAPI
from fastapi_pagination import add_pagination

from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.health import router as health_router
from app.api.common.routers.main import router as api_router
from app.api.common.routers.openapi import init_openapi_docs
from app.core import lifecycle
from app.core.config import settings
from app.core.config.models import Environment
from app.core.middleware import register_middleware


def create_app() -> FastAPI:
    """Create and configure a FastAPI application instance."""
    app = FastAPI(
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
        lifespan=lifecycle.runtime_lifespan,
    )

    register_middleware(app)

    # Include health check routes (liveness and readiness probes)
    app.include_router(health_router)

    # Include the canonical versioned API contract.
    app.include_router(api_router, prefix="/v1")

    # Initialize OpenAPI documentation
    init_openapi_docs(
        app,
        include_internal_contracts=settings.environment in {Environment.DEV, Environment.TESTING},
    )

    # Initialize exception handling
    register_exception_handlers(app)

    # Add pagination
    add_pagination(app)
    return app


# Initialize FastAPI application with lifespan
app = create_app()
