"""OpenTelemetry bootstrap helpers."""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)


@dataclass
class TelemetryState:
    """Mutable telemetry runtime state for startup/shutdown lifecycle handling."""

    initialized: bool = False
    tracer_provider: object | None = None
    fastapi_instrumentor: object | None = None
    sqlalchemy_instrumentor: object | None = None
    httpx_instrumentor: object | None = None


_telemetry_state = TelemetryState()


def _import_symbol(module_name: str, symbol_name: str) -> object:
    """Import a symbol lazily so disabled environments avoid optional deps."""
    module = importlib.import_module(module_name)
    return getattr(module, symbol_name)


def init_telemetry(app: FastAPI, async_engine: AsyncEngine) -> bool:
    """Initialize OpenTelemetry tracing when explicitly enabled."""
    if not settings.otel_enabled:
        app.state.telemetry_enabled = False
        return False

    if _telemetry_state.initialized:
        app.state.telemetry_enabled = True
        return True

    try:
        trace = importlib.import_module("opentelemetry.trace")
        resource_cls = _import_symbol("opentelemetry.sdk.resources", "Resource")
        tracer_provider_cls = _import_symbol("opentelemetry.sdk.trace", "TracerProvider")
        batch_span_processor_cls = _import_symbol("opentelemetry.sdk.trace.export", "BatchSpanProcessor")
        otlp_span_exporter_cls = _import_symbol(
            "opentelemetry.exporter.otlp.proto.http.trace_exporter",
            "OTLPSpanExporter",
        )
        fastapi_instrumentor_cls = _import_symbol("opentelemetry.instrumentation.fastapi", "FastAPIInstrumentor")
        sqlalchemy_instrumentor_cls = _import_symbol(
            "opentelemetry.instrumentation.sqlalchemy",
            "SQLAlchemyInstrumentor",
        )
        httpx_client_instrumentor_cls = _import_symbol("opentelemetry.instrumentation.httpx", "HTTPXClientInstrumentor")
    except ImportError:
        logger.warning("OpenTelemetry is enabled but instrumentation dependencies are not installed")
        app.state.telemetry_enabled = False
        return False

    resource = resource_cls.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment.name": settings.environment,
        }
    )
    tracer_provider = tracer_provider_cls(resource=resource)

    exporter_kwargs: dict[str, str] = {}
    if settings.otel_exporter_otlp_endpoint:
        exporter_kwargs["endpoint"] = settings.otel_exporter_otlp_endpoint

    tracer_provider.add_span_processor(batch_span_processor_cls(otlp_span_exporter_cls(**exporter_kwargs)))
    trace.set_tracer_provider(tracer_provider)

    fastapi_instrumentor = fastapi_instrumentor_cls()
    fastapi_instrumentor.instrument_app(app)

    sqlalchemy_instrumentor = sqlalchemy_instrumentor_cls()
    sqlalchemy_instrumentor.instrument(engine=async_engine.sync_engine)

    httpx_instrumentor = httpx_client_instrumentor_cls()
    httpx_instrumentor.instrument()

    _telemetry_state.initialized = True
    _telemetry_state.tracer_provider = tracer_provider
    _telemetry_state.fastapi_instrumentor = fastapi_instrumentor
    _telemetry_state.sqlalchemy_instrumentor = sqlalchemy_instrumentor
    _telemetry_state.httpx_instrumentor = httpx_instrumentor

    app.state.telemetry_enabled = True
    logger.info("OpenTelemetry instrumentation enabled")
    return True


def shutdown_telemetry(app: FastAPI) -> None:
    """Uninstrument telemetry hooks and flush the tracer provider."""
    if not _telemetry_state.initialized:
        app.state.telemetry_enabled = False
        return

    if _telemetry_state.fastapi_instrumentor is not None:
        _telemetry_state.fastapi_instrumentor.uninstrument_app(app)

    if _telemetry_state.sqlalchemy_instrumentor is not None:
        _telemetry_state.sqlalchemy_instrumentor.uninstrument()

    if _telemetry_state.httpx_instrumentor is not None:
        _telemetry_state.httpx_instrumentor.uninstrument()

    if _telemetry_state.tracer_provider is not None and hasattr(_telemetry_state.tracer_provider, "shutdown"):
        _telemetry_state.tracer_provider.shutdown()

    _telemetry_state.initialized = False
    _telemetry_state.tracer_provider = None
    _telemetry_state.fastapi_instrumentor = None
    _telemetry_state.sqlalchemy_instrumentor = None
    _telemetry_state.httpx_instrumentor = None

    app.state.telemetry_enabled = False
