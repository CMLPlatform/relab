"""OpenTelemetry bootstrap helpers."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from importlib import import_module
from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.core.logging import RequestContextFilter

if TYPE_CHECKING:
    from fastapi import FastAPI
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    from opentelemetry.sdk.resources import Resource
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
    # Log export
    log_provider: Any = field(default=None)
    log_handler: logging.Handler | None = None


_telemetry_state = TelemetryState()


def _init_log_export(resource: Resource, state: TelemetryState) -> None:
    """Wire up stdlib logging to OTLP log export."""
    try:
        otlp_log_exporter_cls = import_module("opentelemetry.exporter.otlp.proto.http._log_exporter").OTLPLogExporter
        logger_provider_cls = import_module("opentelemetry.sdk._logs").LoggerProvider
        batch_log_processor_cls = import_module("opentelemetry.sdk._logs.export").BatchLogRecordProcessor
        set_logger_provider = import_module("opentelemetry._logs").set_logger_provider
        logging_handler_cls = import_module("opentelemetry.sdk._logs._internal").LoggingHandler
    except ImportError, AttributeError:
        logger.warning("OTel log export dependencies unavailable; skipping log export")
        return

    log_provider = logger_provider_cls(resource=resource)
    # No explicit endpoint: the SDK reads OTEL_EXPORTER_OTLP_ENDPOINT from the
    # env and auto-appends /v1/logs. Passing endpoint= would use it as-is (no
    # path append) and hit 404 at the collector.
    log_provider.add_log_record_processor(batch_log_processor_cls(otlp_log_exporter_cls()))
    set_logger_provider(log_provider)

    otel_handler = logging_handler_cls(level=logging.NOTSET, logger_provider=log_provider)
    otel_handler.setLevel(logging.INFO)
    otel_handler.addFilter(RequestContextFilter())
    logging.root.addHandler(otel_handler)

    state.log_handler = otel_handler
    state.log_provider = log_provider


def init_telemetry(app: FastAPI, async_engine: AsyncEngine) -> bool:
    """Initialize OpenTelemetry tracing and log export when explicitly enabled."""
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
    # compose.deploy.yaml), auto-merged by Resource.create().
    resource = resource_cls.create({"deployment.environment.name": settings.environment})
    tracer_provider = tracer_provider_cls(resource=resource)

    # No explicit endpoint: same reason as the log exporter below — the SDK
    # auto-appends /v1/traces when reading OTEL_EXPORTER_OTLP_ENDPOINT from env.
    exporter = otlp_span_exporter()
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

    _init_log_export(resource, _telemetry_state)

    logger.info("OpenTelemetry instrumentation enabled")
    return True


def shutdown_telemetry(app: FastAPI) -> None:
    """Uninstrument telemetry hooks and flush the tracer and log providers."""
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

    if _telemetry_state.log_handler is not None:
        logging.root.removeHandler(_telemetry_state.log_handler)

    if _telemetry_state.log_provider is not None:
        _telemetry_state.log_provider.shutdown()

    _telemetry_state.initialized = False
    _telemetry_state.tracer_provider = None
    _telemetry_state.fastapi_instrumentor = None
    _telemetry_state.sqlalchemy_instrumentor = None
    _telemetry_state.httpx_instrumentor = None
    _telemetry_state.log_provider = None
    _telemetry_state.log_handler = None
    logger.info("OpenTelemetry instrumentation disabled")
