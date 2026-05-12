"""File mounts and static file routes for the application."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import FileResponse
from starlette.staticfiles import NotModifiedResponse

from app.core.config import settings

if TYPE_CHECKING:
    import os

    from starlette.responses import Response
    from starlette.types import Message, Receive, Scope, Send

RESPONSE_START_MESSAGE_TYPE = "http.response.start"


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


class UploadedAssetStaticFiles(CachedStaticFiles):
    """Upload-backed StaticFiles with safer browser response headers."""

    def update_response_headers(self, headers: MutableHeaders, scope: Scope) -> None:
        """Serve uploads with MIME sniffing disabled."""
        super().update_response_headers(headers, scope)
        headers["X-Content-Type-Options"] = "nosniff"


class UploadedFileAttachmentStaticFiles(UploadedAssetStaticFiles):
    """Uploaded file StaticFiles that serve responses as filename-aware attachments."""

    def file_response(
        self,
        full_path: str | os.PathLike[str],
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        """Return a Starlette FileResponse with Content-Disposition derived from the request path."""
        response = FileResponse(
            full_path,
            status_code=status_code,
            stat_result=stat_result,
            filename=Path(str(scope.get("path", ""))).name,
        )
        if self.is_not_modified(response.headers, Headers(scope=scope)):
            return NotModifiedResponse(response.headers)
        return response


FAVICON_ROUTE = "/favicon.ico"


def mount_static_directories(app: FastAPI) -> None:
    """Mount static file directories to the FastAPI application.

    Args:
        app: FastAPI application instance
    """
    # Mount upload subdirectories if they exist. Note: if this is called
    # from lifespan, these directories should have been ensured already.
    if settings.file_storage_path.exists() and settings.image_storage_path.exists():
        app.mount(
            "/uploads/files",
            UploadedFileAttachmentStaticFiles(
                directory=settings.file_storage_path,
                cache_control="public, max-age=31536000, immutable",
            ),
            name="uploaded-files",
        )
        app.mount(
            "/uploads/images",
            UploadedAssetStaticFiles(
                directory=settings.image_storage_path,
                cache_control="public, max-age=31536000, immutable",
            ),
            name="uploaded-images",
        )
    else:
        err_msg = "Upload storage paths do not exist. Ensure storage directories are created at startup."
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
