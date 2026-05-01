"""Structured audit logging for sensitive operations."""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import TYPE_CHECKING

from app.api.common.models.base import get_model_label

if TYPE_CHECKING:
    from uuid import UUID

_audit_logger = logging.getLogger("audit")


class AuditAction(StrEnum):
    """Supported audit action names."""

    DELETE = "delete"
    DEACTIVATE = "deactivate"
    SUPERUSER_ACCESS = "superuser_access"


def audit_event(
    actor_id: UUID | str | None,
    action: AuditAction,
    resource_type: type[object],
    resource_id: object,
    *,
    outcome: str = "ok",
    **context: object,
) -> None:
    """Emit a structured audit log entry.

    In production the root JSON formatter captures all extra fields.
    In development the message line is human-readable.
    """
    resource_type_name = get_model_label(resource_type)
    _audit_logger.info(
        "actor=%s action=%s resource=%s/%s outcome=%s",
        actor_id,
        action,
        resource_type_name,
        resource_id,
        outcome,
        extra={
            "audit": True,
            "actor_id": str(actor_id) if actor_id is not None else None,
            "action": action.value,
            "resource_type": resource_type_name,
            "resource_id": str(resource_id),
            "outcome": outcome,
            **context,
        },
    )
