"""File mounts and static file routes for the application."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import MutableHeaders

from app.core.config import settings

if TYPE_CHECKING:
    from starlette.types import Message, Receive, Scope, Send

RESPONSE_START_MESSAGE_TYPE = "http.response.start"
UPLOAD_FILE_ATTACHMENT_PATH_PREFIX = "/uploads/files/"


class CachedStaticFiles(StaticFiles):
    """StaticFiles that injects a fixed Cache-Control header on every response."""

    def __init__(self, *, directory: str | Path, cache_control: str) -> None:
        super().__init__(directory=directory)
        self._cache_control = cache_control

    def update_response_headers(self, headers: MutableHeaders, scope: Scope) -> None:
        """Apply response headers for this static file mount."""
        del scope
        headers.append("Cache-Control", self._cache_control)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Serve static files while appending the configured cache policy."""

        async def send_with_cache(message: Message) -> None:
            if message["type"] == RESPONSE_START_MESSAGE_TYPE:
                self.update_response_headers(MutableHeaders(scope=message), scope)
            await send(message)

        await super().__call__(scope, receive, send_with_cache)


class UploadStaticFiles(CachedStaticFiles):
    """Upload-backed StaticFiles with safer browser response headers."""

    def update_response_headers(self, headers: MutableHeaders, scope: Scope) -> None:
        """Serve uploads with MIME sniffing disabled and generic files as attachments."""
        super().update_response_headers(headers, scope)
        headers["X-Content-Type-Options"] = "nosniff"
        request_path = str(scope.get("path", ""))
        if request_path.startswith(UPLOAD_FILE_ATTACHMENT_PATH_PREFIX):
            filename = Path(request_path).name
            headers["Content-Disposition"] = f'attachment; filename="{filename}"'


FAVICON_ROUTE = "/favicon.ico"


def mount_static_directories(app: FastAPI) -> None:
    """Mount static file directories to the FastAPI application.

    Args:
        app: FastAPI application instance
    """
    # Mount the uploads directory if it exists. Note: if this is called
    # from lifespan, the directory should have been ensured already.
    if settings.uploads_path.exists():
        app.mount(
            "/uploads",
            UploadStaticFiles(
                directory=settings.uploads_path,
                cache_control="public, max-age=31536000, immutable",
            ),
            name="uploads",
        )
    else:
        err_msg = (
            f"Uploads path '{settings.uploads_path}' does not exist. Ensure storage directories are created at startup."
        )
        raise RuntimeError(err_msg)

    # Static files directory is part of the repo and should exist; mount
    # it if present, otherwise skip to avoid raising at import time.
    if settings.static_files_path.exists():
        app.mount(
            "/static",
            CachedStaticFiles(
                directory=settings.static_files_path,
                cache_control="public, max-age=3600",
            ),
            name="static",
        )
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
