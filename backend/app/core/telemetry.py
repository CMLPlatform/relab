"""OpenTelemetry bootstrap helpers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from fastapi import FastAPI
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.trace import TracerProvider
    from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)


@dataclass
class TelemetryState:
    """Mutable telemetry runtime state for startup/shutdown lifecycle handling."""

    initialized: bool = False
    tracer_provider: TracerProvider | None = None
    fastapi_instrumentor: FastAPIInstrumentor | None = None
    sqlalchemy_instrumentor: SQLAlchemyInstrumentor | None = None
    httpx_instrumentor: HTTPXClientInstrumentor | None = None


_telemetry_state = TelemetryState()


def init_telemetry(app: FastAPI, async_engine: AsyncEngine) -> bool:
    """Initialize OpenTelemetry tracing when explicitly enabled."""
    if not settings.otel_enabled:
        app.state.telemetry_enabled = False
        return False

    if _telemetry_state.initialized:
        app.state.telemetry_enabled = True
        return True

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning("OpenTelemetry is enabled but instrumentation dependencies are not installed")
        app.state.telemetry_enabled = False
        return False

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "deployment.environment.name": settings.environment,
        }
    )
    tracer_provider = TracerProvider(resource=resource)

    exporter = (
        OTLPSpanExporter(endpoint=settings.otel_exporter_otlp_endpoint)
        if settings.otel_exporter_otlp_endpoint
        else OTLPSpanExporter()
    )
    tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(tracer_provider)

    fastapi_instrumentor = FastAPIInstrumentor()
    fastapi_instrumentor.instrument_app(app)

    sqlalchemy_instrumentor = SQLAlchemyInstrumentor()
    sqlalchemy_instrumentor.instrument(engine=async_engine.sync_engine)

    httpx_instrumentor = HTTPXClientInstrumentor()
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

    if _telemetry_state.tracer_provider is not None:
        _telemetry_state.tracer_provider.shutdown()

    _telemetry_state.initialized = False
    _telemetry_state.tracer_provider = None
    _telemetry_state.fastapi_instrumentor = None
    _telemetry_state.sqlalchemy_instrumentor = None
    _telemetry_state.httpx_instrumentor = None

    app.state.telemetry_enabled = False
