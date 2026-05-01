"""Unit tests for structured audit logging."""

from __future__ import annotations

import logging
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
