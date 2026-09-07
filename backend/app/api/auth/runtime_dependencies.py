"""Runtime-service dependencies for auth flows.

Auth owns these runtime services; they live in ``AppServices.extras`` under the
keys below so core stays free of domain imports. Typed access goes through the
accessors here.
"""

from typing import TYPE_CHECKING, cast

from starlette.requests import Request  # noqa: TC002 - FastAPI needs the runtime type for OpenAPI generation.

from app.core.runtime import get_request_services

if TYPE_CHECKING:
    from app.api.auth.services.common_password_checker import CommonPasswordChecker
    from app.api.auth.services.email_checker import EmailChecker
    from app.core.runtime import AppServices

EMAIL_CHECKER_KEY = "auth.email_checker"
COMMON_PASSWORD_CHECKER_KEY = "auth.common_password_checker"  # noqa: S105 - a state key, not a credential


def set_email_checker(services: AppServices, checker: EmailChecker | None) -> None:
    """Store the shared disposable-email checker on the runtime services."""
    services.extras[EMAIL_CHECKER_KEY] = checker


def set_common_password_checker(services: AppServices, checker: CommonPasswordChecker | None) -> None:
    """Store the shared common-password checker on the runtime services."""
    services.extras[COMMON_PASSWORD_CHECKER_KEY] = checker


def email_checker_from(services: AppServices) -> EmailChecker | None:
    """Return the shared disposable-email checker from the runtime services."""
    return cast("EmailChecker | None", services.extras.get(EMAIL_CHECKER_KEY))


def common_password_checker_from(services: AppServices) -> CommonPasswordChecker | None:
    """Return the shared common-password checker from the runtime services."""
    return cast("CommonPasswordChecker | None", services.extras.get(COMMON_PASSWORD_CHECKER_KEY))


def get_email_checker(request: Request) -> EmailChecker | None:
    """Return the shared disposable-email checker from app state."""
    return email_checker_from(get_request_services(request))


def get_common_password_checker(request: Request) -> CommonPasswordChecker | None:
    """Return the shared common-password checker from app state."""
    return common_password_checker_from(get_request_services(request))
