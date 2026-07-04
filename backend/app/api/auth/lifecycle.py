"""Auth runtime lifecycle, wired into the app in the composition root (main.py)."""

from typing import TYPE_CHECKING

from app.api.auth.services.common_password_checker import init_common_password_checker
from app.api.auth.services.email_checker import init_email_checker
from app.core.lifecycle import DomainLifecycle, ShutdownStep

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.core.runtime import AppServices


async def _startup(app: FastAPI, services: AppServices) -> None:  # noqa: ARG001
    services.email_checker = await init_email_checker(services.redis)
    services.common_password_checker = await init_common_password_checker(services.redis)


def _shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:  # noqa: ARG001
    return (
        ShutdownStep(
            label="email checker",
            close=services.email_checker.close if services.email_checker is not None else None,
            expected_errors=(RuntimeError, OSError),
        ),
    )


AUTH_LIFECYCLE = DomainLifecycle(name="auth", startup=_startup, shutdown_steps=_shutdown_steps)
