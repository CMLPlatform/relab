"""Idempotency-key support for create endpoints.

The app retries create POSTs on network failure. A response lost after the server already
committed would otherwise create a duplicate product/component record. A client can opt in by
sending an ``Idempotency-Key`` header on a create request; a retry with the same header on the
same endpoint replays the original response instead of creating a second record. No header means
no behavior change.

The replay cache is a trust boundary: keys are scoped by authenticated user id (never the raw
header value alone), so one user can never observe or replay another user's cached response. See
``.github/SECURITY.md`` under "authenticated mutation APIs".
"""

import json
import logging
import re
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from app.core.redis import get_redis_value, set_redis_value, set_redis_value_nx

if TYPE_CHECKING:
    from uuid import UUID

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

_TTL_SECONDS = 24 * 60 * 60
_IN_FLIGHT = "in-flight"
# Visible ASCII, no whitespace/control characters — matches how clients typically mint these
# (UUIDs, ULIDs, nanoids) and keeps the raw value safe to fold directly into a Redis key.
_KEY_PATTERN = re.compile(r"^[\x21-\x7e]{1,128}$")


def validate_idempotency_key(raw: str | None) -> str | None:
    """Reject a syntactically invalid ``Idempotency-Key`` header (1-128 visible ASCII chars)."""
    if raw is None:
        return None
    if not _KEY_PATTERN.fullmatch(raw):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Idempotency-Key must be 1-128 visible ASCII characters.",
        )
    return raw


def _get_idempotency_key_header(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str | None:
    return validate_idempotency_key(idempotency_key)


IdempotencyKeyDep = Annotated[str | None, Depends(_get_idempotency_key_header)]


def _cache_key(user_id: UUID, endpoint: str, idempotency_key: str) -> str:
    # user_id and endpoint come from the server, never the client, so a raw key value can never
    # forge a different scope no matter what characters it contains.
    return f"idempotency:{user_id}:{endpoint}:{idempotency_key}"


async def begin_idempotent_request(
    redis: Redis,
    *,
    user_id: UUID,
    endpoint: str,
    idempotency_key: str | None,
) -> JSONResponse | None:
    """Claim *idempotency_key* for *user_id*/*endpoint*, or short-circuit with a prior result.

    Returns ``None`` when the caller should process the request normally: either no key was
    given, or this is the first time it's been seen (the in-flight marker is now claimed, and
    the caller must call :func:`finish_idempotent_request` after it commits). Returns a
    ``JSONResponse`` to send back verbatim when a request with the same key already completed.
    Raises ``HTTPException(409)`` when another request with the same key is still in flight.
    """
    if idempotency_key is None:
        return None

    cache_key = _cache_key(user_id, endpoint, idempotency_key)
    claimed = await set_redis_value_nx(redis, cache_key, _IN_FLIGHT, ex=_TTL_SECONDS)
    if claimed:
        return None

    stored = await get_redis_value(redis, cache_key)
    if stored is None or stored == _IN_FLIGHT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A request with this Idempotency-Key is already being processed.",
        )

    payload = json.loads(stored)
    return JSONResponse(status_code=payload["status"], content=payload["body"])


async def finish_idempotent_request(
    redis: Redis,
    *,
    user_id: UUID,
    endpoint: str,
    idempotency_key: str | None,
    status_code: int,
    body: object,
) -> None:
    """Store the completed response so a replay of *idempotency_key* returns it verbatim."""
    if idempotency_key is None:
        return
    cache_key = _cache_key(user_id, endpoint, idempotency_key)
    payload = json.dumps({"status": status_code, "body": body})
    await set_redis_value(redis, cache_key, payload, ex=_TTL_SECONDS)
