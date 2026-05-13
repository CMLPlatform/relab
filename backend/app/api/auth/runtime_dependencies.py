"""Runtime-service dependencies for auth flows."""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from starlette.requests import Request

    from app.api.auth.services.common_password_checker import CommonPasswordChecker
    from app.api.auth.services.email_checker import EmailChecker

_GET_REQUEST_SERVICES = "get_request_services"


def _get_request_services(request: Request) -> object:
    return getattr(import_module("app.core.runtime"), _GET_REQUEST_SERVICES)(request)


def get_email_checker(request: Request) -> EmailChecker | None:
    """Return the shared disposable-email checker from app state."""
    return getattr(_get_request_services(request), "email_checker", None)


def get_common_password_checker(request: Request) -> CommonPasswordChecker | None:
    """Return the shared common-password checker from app state."""
    return getattr(_get_request_services(request), "common_password_checker", None)
