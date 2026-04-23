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
    # Mount the uploads directory if it exists. Note: if this is called
    # from lifespan, the directory should have been ensured already.
    if settings.uploads_path.exists():
        app.mount("/uploads", StaticFiles(directory=settings.uploads_path), name="uploads")
    else:
        err_msg = (
            f"Uploads path '{settings.uploads_path}' does not exist. Ensure storage directories are created at startup."
        )
        raise RuntimeError(err_msg)

    # Static files directory is part of the repo and should exist; mount
    # it if present, otherwise skip to avoid raising at import time.
    if settings.static_files_path.exists():
        app.mount("/static", StaticFiles(directory=settings.static_files_path), name="static")
    else:
        err_msg = (
            f"Static files path '{settings.static_files_path}' does not exist."
            " Ensure storage directories are created at startup."
        )
        raise RuntimeError(err_msg)


def register_favicon_route(app: FastAPI) -> None:
    """Register favicon redirect route.

    Args:
        app: FastAPI application instance
    """

    @app.get(FAVICON_ROUTE, include_in_schema=False)
    async def favicon() -> RedirectResponse:
        """Redirect favicon requests to static files."""
        return RedirectResponse(url="/static/favicon.ico")
