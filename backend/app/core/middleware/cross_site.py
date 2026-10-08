"""Refuse cookie-authenticated writes sent from another site."""

import re
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from fastapi import FastAPI
from starlette.requests import Request

from app.core.config.core import settings
from app.core.http_headers import AUTH_COOKIE_NAMES, path_matches_prefix
from app.core.responses import build_problem_response

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Receive, Scope, Send

API_PATH_PREFIX = "/v1"
# Login sets the session cookies rather than carrying them, so it is checked without one.
SESSION_LOGIN_PATH = "/v1/auth/session/login"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
HTTP_SCOPE_TYPE = "http"
CROSS_SITE = "cross-site"


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def is_allowed_origin(origin: str) -> bool:
    """Return whether a browser Origin may send cookie-authenticated writes.

    The CORS allow-list (and pattern, outside production), plus the API's own origin for
    its interactive docs.
    """
    if origin in settings.allowed_origins or origin == _origin(str(settings.api_public_url)):
        return True
    return settings.cors_origin_regex is not None and re.fullmatch(settings.cors_origin_regex, origin) is not None


def is_cross_site_request(request: Request) -> bool:
    """Return whether a browser marked the request as sent from a page on another site.

    A request with neither ``Sec-Fetch-Site`` nor ``Origin`` (a native app, curl) is not
    a browser cross-site request and passes.
    """
    if request.headers.get("sec-fetch-site") == CROSS_SITE:
        return True
    origin = request.headers.get("origin")
    return origin is not None and not is_allowed_origin(origin)


class CrossSiteRequestMiddleware:
    """Refuse unsafe ``/v1`` requests that carry the session cookies, and session logins, from another site.

    The session cookies are ``SameSite=Lax``, which already keeps them off most cross-site
    writes; this check closes the rest (sibling subdomains count as same-site) and stops
    a foreign page from signing the browser in to an account it chose. Bearer-token
    requests are not checked: a browser never attaches the token on its own.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Answer 403 before routing when an unsafe cookie request comes from another site."""
        if scope["type"] == HTTP_SCOPE_TYPE and scope["method"].upper() in UNSAFE_METHODS:
            request = Request(scope)
            path = request.url.path
            checked = path == SESSION_LOGIN_PATH or (
                path_matches_prefix(path, API_PATH_PREFIX) and not AUTH_COOKIE_NAMES.isdisjoint(request.cookies)
            )
            if checked and is_cross_site_request(request):
                response = build_problem_response(
                    request=request,
                    status_code=403,
                    detail="Cross-site request refused.",
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)


def register_cross_site_request_middleware(app: FastAPI) -> None:
    """Attach the cross-site check for cookie-authenticated writes."""
    app.add_middleware(CrossSiteRequestMiddleware)
