"""Runtime-service dependencies for auth flows."""

from __future__ import annotations

from typing import TYPE_CHECKING

from starlette.requests import Request  # noqa: TC002 - FastAPI needs the runtime type for OpenAPI generation.

from app.core.runtime import get_request_services

if TYPE_CHECKING:
    from app.api.auth.services.common_password_checker import CommonPasswordChecker
    from app.api.auth.services.email_checker import EmailChecker


def get_email_checker(request: Request) -> EmailChecker | None:
    """Return the shared disposable-email checker from app state."""
    return get_request_services(request).email_checker


def get_common_password_checker(request: Request) -> CommonPasswordChecker | None:
    """Return the shared common-password checker from app state."""
    return get_request_services(request).common_password_checker
