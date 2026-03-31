"""Compatibility wrapper for OpenTelemetry bootstrap helpers."""

from app.core.config import settings
from app.core.observability.telemetry import init_telemetry, shutdown_telemetry

__all__ = ["init_telemetry", "settings", "shutdown_telemetry"]
