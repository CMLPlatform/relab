"""Auth runtime lifecycle, wired into the app in the composition root (main.py)."""

import logging
from typing import TYPE_CHECKING

from app.api.auth.config import settings as auth_settings
from app.api.auth.runtime_dependencies import (
    email_checker_from,
    set_common_password_checker,
    set_email_checker,
)
from app.api.auth.services.common_password_checker import init_common_password_checker
from app.api.auth.services.email_checker import init_email_checker
from app.core.lifecycle import DomainLifecycle, ShutdownStep
from app.core.secrets import warn_on_placeholder_secrets

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.core.runtime import AppServices

logger = logging.getLogger(__name__)


async def _startup(app: FastAPI, services: AppServices) -> None:  # noqa: ARG001
    warn_on_placeholder_secrets(logger, auth_settings)
    set_email_checker(services, await init_email_checker(services.redis))
    set_common_password_checker(services, await init_common_password_checker(services.redis))


def _shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:  # noqa: ARG001
    email_checker = email_checker_from(services)
    return (
        ShutdownStep(
            label="email checker",
            close=email_checker.close if email_checker is not None else None,
            expected_errors=(RuntimeError, OSError),
        ),
    )


AUTH_LIFECYCLE = DomainLifecycle(name="auth", startup=_startup, shutdown_steps=_shutdown_steps)
