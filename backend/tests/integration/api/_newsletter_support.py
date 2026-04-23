"""Shared helpers for newsletter integration tests."""

from __future__ import annotations

from typing import cast

EMAIL_NEW = "new@example.com"
EMAIL_EXISTING = "existing@example.com"
EMAIL_CONFIRMED = "confirmed@example.com"
EMAIL_CONFIRM_REQ = "confirm@example.com"
EMAIL_UNSUBSCRIBE = "unsubscribe@example.com"
EMAIL_DELETE = "delete@example.com"
MSG_NOT_CONFIRMED = "Already subscribed, but not confirmed"
MSG_ALREADY_SUB = "Already subscribed"
HTTP_CREATED = 201
HTTP_BAD_REQUEST = 400
HTTP_OK = 200
HTTP_NO_CONTENT = 204


def detail_text(payload: dict[str, object]) -> str:
    """Return a comparable error-detail string across supported error shapes."""
    detail = payload["detail"]
    if isinstance(detail, dict):
        detail_dict = cast("dict[str, object]", detail)
        return str(detail_dict.get("message") or "")
    return str(detail)
