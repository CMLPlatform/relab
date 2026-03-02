"""File mounts and static file routes for the application."""

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

FAVICON_ROUTE = "/favicon.ico"


def mount_static_directories(app: FastAPI) -> None:
    """Mount static file directories to the FastAPI application.

    Args:
        app: FastAPI application instance
    """
    app.mount("/uploads", StaticFiles(directory=settings.uploads_path), name="uploads")
    app.mount("/static", StaticFiles(directory=settings.static_files_path), name="static")


def register_favicon_route(app: FastAPI) -> None:
    """Register favicon redirect route.

    Args:
        app: FastAPI application instance
    """

    @app.get(FAVICON_ROUTE, include_in_schema=False)
    async def favicon() -> RedirectResponse:
        """Redirect favicon requests to static files."""
        return RedirectResponse(url="/static/favicon.ico")
