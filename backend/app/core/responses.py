"""HTTP response helpers for standardized payloads and conditional requests."""

from __future__ import annotations

import hashlib
import json
from http import HTTPStatus
from typing import TYPE_CHECKING

from fastapi.encoders import jsonable_encoder
from fastapi.requests import Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.core.middleware import REQUEST_ID_HEADER

if TYPE_CHECKING:
    from collections.abc import Mapping

PROBLEM_CONTENT_TYPE = "application/problem+json"
ETAG_WILDCARD = "*"


def _quoted_etag(payload: bytes) -> str:
    digest = hashlib.sha256(payload).hexdigest()
    return f'"{digest}"'


def _request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    request_id = getattr(request.state, "request_id", None)
    return request_id if isinstance(request_id, str) else None


def _etag_matches(if_none_match: str | None, current_etag: str) -> bool:
    """Return whether the request's ``If-None-Match`` header matches ``current_etag``."""
    if if_none_match is None:
        return False
    if if_none_match.strip() == ETAG_WILDCARD:
        return True

    candidates = {candidate.strip() for candidate in if_none_match.split(",")}
    return current_etag in candidates or f"W/{current_etag}" in candidates


def _response_headers(request: Request | None, headers: Mapping[str, str] | None = None) -> dict[str, str]:
    response_headers = dict(headers or {})
    request_id = _request_id(request)
    if request_id and REQUEST_ID_HEADER not in response_headers:
        response_headers[REQUEST_ID_HEADER] = request_id
    return response_headers


def build_problem_response(
    *,
    request: Request | None,
    status_code: int,
    detail: str,
    type_: str = "about:blank",
    title: str | None = None,
    code: str | None = None,
    extra: Mapping[str, object] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Build a Problem Details error response."""
    problem: dict[str, object] = {
        "type": type_,
        "title": title or HTTPStatus(status_code).phrase,
        "status": status_code,
        "detail": detail,
    }
    request_id = _request_id(request)
    if request_id is not None:
        problem["request_id"] = request_id
    if code is not None:
        problem["code"] = code
    if extra:
        problem.update(extra)

    return JSONResponse(
        status_code=status_code,
        content=problem,
        media_type=PROBLEM_CONTENT_TYPE,
        headers=_response_headers(request, headers),
    )


def conditional_json_response(
    request: Request,
    payload: object,
    *,
    etag_seed: str | None = None,
    status_code: int = 200,
    headers: Mapping[str, str] | None = None,
) -> Response:
    """Return a JSON response with ETag support."""
    encoded_payload = jsonable_encoder(payload)
    response_bytes = (
        etag_seed.encode("utf-8")
        if etag_seed is not None
        else json.dumps(encoded_payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    etag = _quoted_etag(response_bytes)
    response_headers = _response_headers(request, headers)
    response_headers["ETag"] = etag

    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=response_headers)

    return JSONResponse(status_code=status_code, content=encoded_payload, headers=response_headers)


def conditional_html_response(
    request: Request,
    content: str,
    *,
    status_code: int = 200,
    headers: Mapping[str, str] | None = None,
) -> Response:
    """Return an HTML response with ETag support."""
    response_bytes = content.encode("utf-8")
    etag = _quoted_etag(response_bytes)
    response_headers = _response_headers(request, headers)
    response_headers["ETag"] = etag

    if _etag_matches(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=response_headers)

    return HTMLResponse(content=content, status_code=status_code, headers=response_headers)
