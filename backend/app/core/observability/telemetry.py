"""OpenTelemetry bootstrap helpers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from importlib import import_module
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
        return False

    if _telemetry_state.initialized:
        return True

    try:
        trace = import_module("opentelemetry.trace")
        otlp_span_exporter = import_module("opentelemetry.exporter.otlp.proto.http.trace_exporter").OTLPSpanExporter
        fastapi_instrumentor_cls = import_module("opentelemetry.instrumentation.fastapi").FastAPIInstrumentor
        httpx_instrumentor_cls = import_module("opentelemetry.instrumentation.httpx").HTTPXClientInstrumentor
        sqlalchemy_instrumentor_cls = import_module("opentelemetry.instrumentation.sqlalchemy").SQLAlchemyInstrumentor
        resource_cls = import_module("opentelemetry.sdk.resources").Resource
        tracer_provider_cls = import_module("opentelemetry.sdk.trace").TracerProvider
        batch_span_processor_cls = import_module("opentelemetry.sdk.trace.export").BatchSpanProcessor
    except ImportError:
        logger.warning("OpenTelemetry is enabled but instrumentation dependencies are not installed")
        return False

    # service.name comes from OTEL_SERVICE_NAME in the container env (set in
    # compose.deploy.yml), auto-merged by Resource.create().
    resource = resource_cls.create({"deployment.environment.name": settings.environment})
    tracer_provider = tracer_provider_cls(resource=resource)

    exporter = otlp_span_exporter(endpoint=settings.otel_exporter_otlp_endpoint)
    tracer_provider.add_span_processor(batch_span_processor_cls(exporter))
    trace.set_tracer_provider(tracer_provider)

    fastapi_instrumentor = fastapi_instrumentor_cls()
    fastapi_instrumentor.instrument_app(app)

    sqlalchemy_instrumentor = sqlalchemy_instrumentor_cls()
    sqlalchemy_instrumentor.instrument(engine=async_engine.sync_engine)

    httpx_instrumentor = httpx_instrumentor_cls()
    httpx_instrumentor.instrument()

    _telemetry_state.initialized = True
    _telemetry_state.tracer_provider = tracer_provider
    _telemetry_state.fastapi_instrumentor = fastapi_instrumentor
    _telemetry_state.sqlalchemy_instrumentor = sqlalchemy_instrumentor
    _telemetry_state.httpx_instrumentor = httpx_instrumentor

    logger.info("OpenTelemetry instrumentation enabled")
    return True


def shutdown_telemetry(app: FastAPI) -> None:
    """Uninstrument telemetry hooks and flush the tracer provider."""
    if not _telemetry_state.initialized:
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
    logger.info("OpenTelemetry instrumentation disabled")
