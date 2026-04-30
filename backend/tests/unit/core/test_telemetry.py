"""Unit tests for optional OpenTelemetry bootstrap."""

from __future__ import annotations

import logging
import sys
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

from fastapi import FastAPI

from app.core.logging import RequestContextFilter
from app.core.observability.telemetry import _telemetry_state, init_telemetry, shutdown_telemetry

if TYPE_CHECKING:
    import pytest


class _FakeResource:
    @staticmethod
    def create(attributes: dict[str, object]) -> dict[str, object]:
        return attributes


class _FakeTracerProvider:
    def __init__(self, *, resource: dict[str, object]) -> None:
        self.resource = resource
        self.processors: list[object] = []
        self.shutdown = MagicMock()

    def add_span_processor(self, processor: object) -> None:
        self.processors.append(processor)


class _FakeLoggerProvider:
    def __init__(self, *, resource: dict[str, object]) -> None:
        self.resource = resource
        self.processors: list[object] = []
        self.shutdown = MagicMock()

    def add_log_record_processor(self, processor: object) -> None:
        self.processors.append(processor)


class _FakeLoggingHandler(logging.Handler):
    def __init__(self, *, level: int, logger_provider: _FakeLoggerProvider) -> None:
        super().__init__(level=level)
        self.level = level
        self.logger_provider = logger_provider

    def handle(self, record: logging.LogRecord) -> bool:
        del record
        return True


def _build_fake_otel_modules(
    fastapi_instrumentor: MagicMock,
    sqlalchemy_instrumentor: MagicMock,
    httpx_instrumentor: MagicMock,
) -> dict[str, object]:
    """Build a dict of fake sys.modules entries for OpenTelemetry packages."""
    trace_module = SimpleNamespace(set_tracer_provider=MagicMock())
    return {
        "opentelemetry": SimpleNamespace(trace=trace_module),
        "opentelemetry.trace": trace_module,
        "opentelemetry.sdk": SimpleNamespace(),
        "opentelemetry.sdk.resources": SimpleNamespace(Resource=_FakeResource),
        "opentelemetry.sdk.trace": SimpleNamespace(TracerProvider=_FakeTracerProvider),
        "opentelemetry.sdk.trace.export": SimpleNamespace(
            BatchSpanProcessor=lambda exporter: ("batch", exporter),
        ),
        "opentelemetry.sdk._logs": SimpleNamespace(LoggerProvider=_FakeLoggerProvider),
        "opentelemetry.sdk._logs.export": SimpleNamespace(
            BatchLogRecordProcessor=lambda exporter: ("log-batch", exporter),
        ),
        "opentelemetry.sdk._logs._internal": SimpleNamespace(LoggingHandler=_FakeLoggingHandler),
        "opentelemetry._logs": SimpleNamespace(set_logger_provider=MagicMock()),
        "opentelemetry.exporter": SimpleNamespace(),
        "opentelemetry.exporter.otlp": SimpleNamespace(),
        "opentelemetry.exporter.otlp.proto": SimpleNamespace(),
        "opentelemetry.exporter.otlp.proto.http": SimpleNamespace(),
        "opentelemetry.exporter.otlp.proto.http.trace_exporter": SimpleNamespace(
            OTLPSpanExporter=lambda **kwargs: ("otlp", kwargs),
        ),
        "opentelemetry.exporter.otlp.proto.http._log_exporter": SimpleNamespace(
            OTLPLogExporter=lambda **kwargs: ("otlp-log", kwargs),
        ),
        "opentelemetry.instrumentation": SimpleNamespace(),
        "opentelemetry.instrumentation.fastapi": SimpleNamespace(
            FastAPIInstrumentor=lambda: fastapi_instrumentor,
        ),
        "opentelemetry.instrumentation.sqlalchemy": SimpleNamespace(
            SQLAlchemyInstrumentor=lambda: sqlalchemy_instrumentor,
        ),
        "opentelemetry.instrumentation.httpx": SimpleNamespace(
            HTTPXClientInstrumentor=lambda: httpx_instrumentor,
        ),
    }


def test_init_telemetry_returns_false_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disabled telemetry should not import or instrument anything."""
    app = FastAPI()
    async_engine = MagicMock()

    monkeypatch.setattr("app.core.observability.telemetry.settings.otel_exporter_otlp_endpoint", None)

    assert init_telemetry(app, async_engine) is False


def test_init_telemetry_instruments_app_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enabled telemetry should set up the tracer provider and instrumentors."""
    app = FastAPI()
    async_engine = MagicMock()
    fastapi_instrumentor = MagicMock()
    sqlalchemy_instrumentor = MagicMock()
    httpx_instrumentor = MagicMock()

    monkeypatch.setattr(
        "app.core.observability.telemetry.settings.otel_exporter_otlp_endpoint", "http://otel:4318/v1/traces"
    )
    monkeypatch.setattr("app.core.observability.telemetry.settings.environment", "testing")

    fake_modules = _build_fake_otel_modules(fastapi_instrumentor, sqlalchemy_instrumentor, httpx_instrumentor)
    trace_module = fake_modules["opentelemetry.trace"]
    assert isinstance(trace_module, SimpleNamespace)

    with patch.dict(sys.modules, fake_modules):
        assert init_telemetry(app, async_engine) is True

    trace_module.set_tracer_provider.assert_called_once()
    fastapi_instrumentor.instrument_app.assert_called_once_with(app)
    sqlalchemy_instrumentor.instrument.assert_called_once_with(engine=async_engine.sync_engine)
    httpx_instrumentor.instrument.assert_called_once_with()
    assert isinstance(_telemetry_state.log_handler, _FakeLoggingHandler)
    assert isinstance(_telemetry_state.log_provider, _FakeLoggerProvider)
    assert any(isinstance(log_filter, RequestContextFilter) for log_filter in _telemetry_state.log_handler.filters)

    shutdown_telemetry(app)

    fastapi_instrumentor.uninstrument_app.assert_called_once_with(app)
    sqlalchemy_instrumentor.uninstrument.assert_called_once_with()
    httpx_instrumentor.uninstrument.assert_called_once_with()
    assert _telemetry_state.log_handler is None
    assert _telemetry_state.log_provider is None


def test_init_telemetry_returns_false_when_dependencies_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing optional telemetry dependencies should fail closed, not crash startup."""
    app = FastAPI()
    async_engine = MagicMock()

    monkeypatch.setattr(
        "app.core.observability.telemetry.settings.otel_exporter_otlp_endpoint", "http://otel:4318/v1/traces"
    )

    # Setting a module to None in sys.modules causes ImportError on import
    with patch.dict(sys.modules, {"opentelemetry": None}):
        assert init_telemetry(app, async_engine) is False
