"""Unit tests for optional OpenTelemetry bootstrap."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

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
    trace_module = SimpleNamespace(set_tracer_provider=MagicMock())
    fastapi_instrumentor = MagicMock()
    sqlalchemy_instrumentor = MagicMock()
    httpx_instrumentor = MagicMock()

    def fake_import_module(module_name: str) -> object:
        modules: dict[str, object] = {
            "opentelemetry.trace": trace_module,
            "opentelemetry.sdk.resources": SimpleNamespace(Resource=_FakeResource),
            "opentelemetry.sdk.trace": SimpleNamespace(TracerProvider=_FakeTracerProvider),
            "opentelemetry.sdk.trace.export": SimpleNamespace(
                BatchSpanProcessor=lambda exporter: ("batch", exporter),
            ),
            "opentelemetry.exporter.otlp.proto.http.trace_exporter": SimpleNamespace(
                OTLPSpanExporter=lambda **kwargs: ("otlp", kwargs),
            ),
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
        return modules[module_name]

    monkeypatch.setattr("app.core.telemetry.settings.otel_enabled", True)
    monkeypatch.setattr("app.core.telemetry.settings.otel_service_name", "relab-test")
    monkeypatch.setattr("app.core.telemetry.settings.otel_exporter_otlp_endpoint", "http://otel:4318/v1/traces")
    monkeypatch.setattr("app.core.telemetry.settings.environment", "testing")
    monkeypatch.setattr("app.core.telemetry.importlib.import_module", fake_import_module)

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

    def fake_import_module(_: str) -> object:
        msg = "missing dependency"
        raise ImportError(msg)

    monkeypatch.setattr("app.core.telemetry.settings.otel_enabled", True)
    monkeypatch.setattr("app.core.telemetry.importlib.import_module", fake_import_module)

    assert init_telemetry(app, async_engine) is False
    assert app.state.telemetry_enabled is False
