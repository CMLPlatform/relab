"""Structured audit logging for sensitive operations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from app.api.common.models.base import get_model_label
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from uuid import UUID

_audit_logger = logging.getLogger("audit")


class AuditAction(StrEnum):
    """Supported audit action names."""

    DELETE = "delete"
    DEACTIVATE = "deactivate"
    SUPERUSER_ACCESS = "superuser_access"
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    MFA_SUCCESS = "mfa_success"
    MFA_FAILURE = "mfa_failure"
    LOGOUT = "logout"
    SESSIONS_REVOKED = "sessions_revoked"
    AUTHORIZATION_DENIED = "authorization_denied"
    RATE_LIMITED = "rate_limited"


@dataclass(frozen=True, kw_only=True)
class AuditContext:
    """Optional structured audit fields allowed on log records."""

    outcome: str = "ok"
    reason: str | None = None
    transport: str | None = None
    flow: str | None = None
    operation: str | None = None
    status_code: int | None = None
    error_code: str | None = None


def _resource_type_name(resource_type: type[object] | str) -> str:
    if isinstance(resource_type, str):
        return sanitize_log_value(resource_type)
    return sanitize_log_value(get_model_label(resource_type))


def _safe_extra_value(value: object) -> object:
    if isinstance(value, str | StrEnum):
        return sanitize_log_value(value)
    if value is None or isinstance(value, bool | int | float):
        return value
    return sanitize_log_value(value)


def _safe_context(context: dict[str, object]) -> dict[str, object]:
    safe: dict[str, object] = {}
    for key, value in context.items():
        if value is not None:
            safe[key] = _safe_extra_value(value)
    return safe


def audit_event(
    actor_id: UUID | str | None,
    action: AuditAction,
    resource_type: type[object] | str,
    resource_id: object,
    *,
    context: AuditContext | None = None,
) -> None:
    """Emit a structured audit log entry.

    In production the root JSON formatter captures all extra fields.
    In development the message line is human-readable.
    """
    resource_type_name = _resource_type_name(resource_type)
    safe_actor_id = _safe_extra_value(str(actor_id)) if actor_id is not None else None
    safe_resource_id = _safe_extra_value(resource_id)
    audit_context = context or AuditContext()
    safe_outcome = sanitize_log_value(audit_context.outcome)
    extra: dict[str, object] = {
        "audit": True,
        "actor_id": safe_actor_id,
        "action": action.value,
        "resource_type": resource_type_name,
        "resource_id": safe_resource_id,
        "outcome": safe_outcome,
        **_safe_context(
            {
                "reason": audit_context.reason,
                "transport": audit_context.transport,
                "flow": audit_context.flow,
                "operation": audit_context.operation,
                "status_code": audit_context.status_code,
                "error_code": audit_context.error_code,
            },
        ),
    }
    _audit_logger.info(
        "actor=%s action=%s resource=%s/%s outcome=%s",
        safe_actor_id,
        action.value,
        resource_type_name,
        safe_resource_id,
        safe_outcome,
        extra=extra,
    )
