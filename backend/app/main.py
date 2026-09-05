"""Main application entrypoint for the Relab backend."""

from functools import partial

from fastapi import FastAPI
from fastapi_pagination import add_pagination

from app.api.auth.lifecycle import AUTH_LIFECYCLE
from app.api.common.routers.exceptions import register_exception_handlers
from app.api.common.routers.health import router as health_router
from app.api.common.routers.openapi import init_openapi_docs
from app.api.file_storage.lifecycle import FILE_STORAGE_LIFECYCLE
from app.api.plugins.rpi_cam.lifecycle import RPI_CAM_LIFECYCLE
from app.api.router import router as api_router
from app.core import lifecycle
from app.core.config import settings
from app.core.config.models import Environment
from app.core.middleware import register_middleware

# Composition root: domain lifecycles run in this order at startup
# (and in reverse at shutdown, before core services close).
DOMAIN_LIFECYCLES = (AUTH_LIFECYCLE, RPI_CAM_LIFECYCLE, FILE_STORAGE_LIFECYCLE)


def create_app() -> FastAPI:
    """Create and configure a FastAPI application instance."""
    app = FastAPI(
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
        lifespan=partial(lifecycle.runtime_lifespan, domains=DOMAIN_LIFECYCLES),
    )

    register_middleware(app)

    # Include health check routes (liveness and readiness probes)
    app.include_router(health_router)

    # Include the canonical versioned API contract.
    app.include_router(api_router, prefix="/v1")

    init_openapi_docs(
        app,
        include_internal_contracts=settings.environment in {Environment.DEV, Environment.TESTING},
    )
    register_exception_handlers(app)
    add_pagination(app)
    return app


app = create_app()
