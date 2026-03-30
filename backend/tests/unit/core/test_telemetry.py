"""Unit tests for optional OpenTelemetry bootstrap."""

from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI

from app.core.telemetry import init_telemetry, shutdown_telemetry


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
        "opentelemetry.exporter": SimpleNamespace(),
        "opentelemetry.exporter.otlp": SimpleNamespace(),
        "opentelemetry.exporter.otlp.proto": SimpleNamespace(),
        "opentelemetry.exporter.otlp.proto.http": SimpleNamespace(),
        "opentelemetry.exporter.otlp.proto.http.trace_exporter": SimpleNamespace(
            OTLPSpanExporter=lambda **kwargs: ("otlp", kwargs),
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


@pytest.mark.unit
def test_init_telemetry_returns_false_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Disabled telemetry should not import or instrument anything."""
    app = FastAPI()
    app.state.telemetry_enabled = True
    async_engine = MagicMock()

    monkeypatch.setattr("app.core.telemetry.settings.otel_enabled", False)

    assert init_telemetry(app, async_engine) is False
    assert app.state.telemetry_enabled is False


@pytest.mark.unit
def test_init_telemetry_instruments_app_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Enabled telemetry should set up the tracer provider and instrumentors."""
    app = FastAPI()
    async_engine = MagicMock()
    fastapi_instrumentor = MagicMock()
    sqlalchemy_instrumentor = MagicMock()
    httpx_instrumentor = MagicMock()

    monkeypatch.setattr("app.core.telemetry.settings.otel_enabled", True)
    monkeypatch.setattr("app.core.telemetry.settings.otel_service_name", "relab-test")
    monkeypatch.setattr("app.core.telemetry.settings.otel_exporter_otlp_endpoint", "http://otel:4318/v1/traces")
    monkeypatch.setattr("app.core.telemetry.settings.environment", "testing")

    fake_modules = _build_fake_otel_modules(fastapi_instrumentor, sqlalchemy_instrumentor, httpx_instrumentor)
    trace_module = fake_modules["opentelemetry.trace"]
    assert isinstance(trace_module, SimpleNamespace)

    with patch.dict(sys.modules, fake_modules):
        assert init_telemetry(app, async_engine) is True

    assert app.state.telemetry_enabled is True
    trace_module.set_tracer_provider.assert_called_once()
    fastapi_instrumentor.instrument_app.assert_called_once_with(app)
    sqlalchemy_instrumentor.instrument.assert_called_once_with(engine=async_engine.sync_engine)
    httpx_instrumentor.instrument.assert_called_once_with()

    shutdown_telemetry(app)

    fastapi_instrumentor.uninstrument_app.assert_called_once_with(app)
    sqlalchemy_instrumentor.uninstrument.assert_called_once_with()
    httpx_instrumentor.uninstrument.assert_called_once_with()


@pytest.mark.unit
def test_init_telemetry_returns_false_when_dependencies_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing optional telemetry dependencies should fail closed, not crash startup."""
    app = FastAPI()
    async_engine = MagicMock()

    monkeypatch.setattr("app.core.telemetry.settings.otel_enabled", True)

    # Setting a module to None in sys.modules causes ImportError on import
    with patch.dict(sys.modules, {"opentelemetry": None}):
        assert init_telemetry(app, async_engine) is False
    assert app.state.telemetry_enabled is False
