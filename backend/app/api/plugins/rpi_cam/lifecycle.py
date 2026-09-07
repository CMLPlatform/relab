"""RPi camera plugin runtime lifecycle, wired into the app in the composition root (main.py)."""

from typing import TYPE_CHECKING

from app.api.plugins.rpi_cam.websocket.connection_manager import CameraConnectionManager
from app.api.plugins.rpi_cam.websocket.runtime_state import set_connection_manager
from app.core.lifecycle import DomainLifecycle, ShutdownStep

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.core.runtime import AppServices


async def _startup(app: FastAPI, services: AppServices) -> None:  # noqa: ARG001
    set_connection_manager(CameraConnectionManager())


def _shutdown_steps(app: FastAPI, services: AppServices) -> tuple[ShutdownStep, ...]:  # noqa: ARG001
    return (ShutdownStep(label="camera connection manager", close=lambda: set_connection_manager(None)),)


RPI_CAM_LIFECYCLE = DomainLifecycle(name="rpi_cam", startup=_startup, shutdown_steps=_shutdown_steps)
