"""REST request and response media negotiation middleware."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response

from app.core.responses import build_problem_response

if TYPE_CHECKING:
    from starlette.middleware.base import RequestResponseEndpoint

API_PATH_PREFIX = "/v1"
OPENAPI_JSON_SUFFIX = ".json"
SKIPPED_PATH_PREFIXES = ("/static", "/uploads")
SUPPORTED_REQUEST_MEDIA_TYPES = frozenset(
    {
        "application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
    }
)
SUPPORTED_RESPONSE_MEDIA_TYPES = frozenset({"application/json", "application/problem+json"})
WILDCARD_RESPONSE_MEDIA_TYPES = frozenset({"*/*", "application/*"})
BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "DELETE"})
ACCEPT_QUALITY_PARAMETER = "q"
JSON_STRUCTURED_SUFFIX = "+json"


def _path_matches_prefix(path: str, prefix: str) -> bool:
    """Return whether path is exactly prefix or a child path."""
    return path == prefix or path.startswith(f"{prefix}/")


def _is_skipped_path(path: str) -> bool:
    """Return whether middleware should ignore this path."""
    return any(_path_matches_prefix(path, prefix) for prefix in SKIPPED_PATH_PREFIXES)


def _is_api_path(path: str) -> bool:
    """Return whether this path is a JSON API/document contract path."""
    return _path_matches_prefix(path, API_PATH_PREFIX) or (
        path.startswith("/openapi") and path.endswith(OPENAPI_JSON_SUFFIX)
    )


def _base_media_type(value: str) -> str:
    """Return a lower-case media type without parameters."""
    return value.split(";", maxsplit=1)[0].strip().lower()


def _request_has_body(request: Request) -> bool:
    """Return whether request headers indicate a request body is present."""
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            return int(content_length) > 0
        except ValueError:
            return True
    return request.headers.get("transfer-encoding") is not None and request.method not in BODYLESS_METHODS


def _request_content_type_supported(request: Request) -> bool:
    """Return whether the request body media type is supported."""
    content_type = request.headers.get("content-type")
    if content_type is None:
        return False
    return _base_media_type(content_type) in SUPPORTED_REQUEST_MEDIA_TYPES


def _client_accepts_json_response(accept_header: str | None) -> bool:
    """Return whether the client accepts JSON or Problem Details responses."""
    if not accept_header:
        return True

    for candidate in accept_header.split(","):
        media_type = _base_media_type(candidate)
        if not media_type or _quality_is_zero(candidate):
            continue
        if media_type in WILDCARD_RESPONSE_MEDIA_TYPES:
            return True
        if media_type in SUPPORTED_RESPONSE_MEDIA_TYPES:
            return True
        if media_type.endswith(JSON_STRUCTURED_SUFFIX):
            return True
    return False


def _quality_is_zero(accept_candidate: str) -> bool:
    """Return whether one Accept candidate is explicitly disabled."""
    quality = _quality(accept_candidate)
    if quality is None:
        return False
    try:
        return float(quality) <= 0
    except ValueError:
        return False


def _quality(accept_candidate: str) -> str | None:
    """Return the q parameter value for one Accept candidate, if present."""
    for parameter in accept_candidate.split(";")[1:]:
        name, _, value = parameter.strip().partition("=")
        if name.lower() == ACCEPT_QUALITY_PARAMETER:
            return value.strip()
    return None


def _problem(request: Request, status_code: int, detail: str, code: str) -> Response:
    """Build a content-negotiation Problem Details response."""
    return build_problem_response(
        request=request,
        status_code=status_code,
        detail=detail,
        code=code,
        type_=f"https://httpstatuses.com/{status_code}",
        title=HTTPStatus(status_code).phrase,
    )


def register_content_negotiation_middleware(app: FastAPI) -> None:
    """Register lean REST content negotiation checks."""

    @app.middleware("http")
    async def content_negotiation_middleware(request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if _is_skipped_path(path) or not _is_api_path(path):
            return await call_next(request)

        if _request_has_body(request) and not _request_content_type_supported(request):
            return _problem(
                request,
                415,
                "Request body media type is not supported.",
                "UnsupportedMediaType",
            )

        if not _client_accepts_json_response(request.headers.get("accept")):
            return _problem(
                request,
                406,
                "Response media type is not acceptable.",
                "NotAcceptable",
            )

        return await call_next(request)
