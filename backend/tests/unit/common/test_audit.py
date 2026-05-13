"""Unit tests for structured audit logging."""

from __future__ import annotations

import logging
from inspect import Parameter, signature
from typing import TYPE_CHECKING
from uuid import uuid4

from app.api.common.audit import AuditAction, audit_event
from app.api.reference_data.models import Material

if TYPE_CHECKING:
    import pytest


def test_audit_event_records_action_as_string_value(caplog: pytest.LogCaptureFixture) -> None:
    """Audit log records should expose action as a plain string for JSON logging."""
    actor_id = uuid4()

    with caplog.at_level(logging.INFO, logger="audit"):
        audit_event(actor_id, AuditAction.DELETE, Material, uuid4())

    record = caplog.records[0]
    assert record.action == "delete"
    assert type(record.action) is str


def test_audit_event_records_model_class_as_resource_type(caplog: pytest.LogCaptureFixture) -> None:
    """Callers should pass model classes instead of repeating string resource names."""
    with caplog.at_level(logging.INFO, logger="audit"):
        audit_event("actor", AuditAction.DELETE, Material, 1)

    assert caplog.records[0].resource_type == "Material"


def test_audit_event_sanitizes_structured_string_fields(caplog: pytest.LogCaptureFixture) -> None:
    """Structured audit fields should not allow newline-based log injection."""
    with caplog.at_level(logging.INFO, logger="audit"):
        audit_event(
            "actor\nid",
            AuditAction.LOGIN_FAILURE,
            "auth\nflow",
            "credential\rslot",
            outcome="denied\nnow",
            reason="bad\npassword",
        )

    record = caplog.records[0]
    assert record.actor_id == "actor id"
    assert record.action == "login_failure"
    assert record.resource_type == "auth flow"
    assert record.resource_id == "credential slot"
    assert record.outcome == "denied now"
    assert record.reason == "bad password"


def test_audit_event_has_explicit_optional_fields_only() -> None:
    """Audit context should stay narrow to avoid LogRecord field collisions."""
    parameters = signature(audit_event).parameters

    assert all(parameter.kind is not Parameter.VAR_KEYWORD for parameter in parameters.values())
    assert "request" not in parameters
    assert {"reason", "transport", "flow", "operation", "status_code", "error_code"} <= set(parameters)


def test_audit_event_sanitizes_explicit_optional_fields(caplog: pytest.LogCaptureFixture) -> None:
    """Optional audit fields should be sanitized before reaching the log record."""
    with caplog.at_level(logging.INFO, logger="audit"):
        audit_event(
            None,
            AuditAction.LOGIN_FAILURE,
            "auth",
            "credentials",
            reason="bad\ncredentials",
            transport="bearer\nclient",
            flow="login\rchallenge",
            operation="mfa\nreset",
            status_code=403,
            error_code="Forbidden\nError",
        )

    record = caplog.records[0]
    assert record.reason == "bad credentials"
    assert record.transport == "bearer client"
    assert record.flow == "login challenge"
    assert record.operation == "mfa reset"
    assert record.status_code == 403
    assert record.error_code == "Forbidden Error"
