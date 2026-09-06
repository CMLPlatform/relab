"""Idempotency-key support for create endpoints.

The app retries create POSTs on network failure. A retry with the same ``Idempotency-Key``
header, user, endpoint (parent id included) and body replays the original response instead
of creating a second record.

Cache keys are scoped by authenticated user id, so one user can never replay another's
response. The entry carries a body hash, so reusing a key with a different payload is a 422.
See ``.github/SECURITY.md`` under "authenticated mutation APIs".
"""

import hashlib
import json
import logging
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from app.core.http_headers import IDEMPOTENCY_KEY_HEADER
from app.core.redis import delete_redis_key, get_redis_value, set_redis_value, set_redis_value_nx

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
    from uuid import UUID

    from pydantic import BaseModel
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

# Pass as ``responses=IDEMPOTENCY_RESPONSES`` on each guarded route. 422 is left to FastAPI's
# own entry (overriding it drops the ``HTTPValidationError`` schema); describe the
# "key reused with a different body" case in the route docstring.
IDEMPOTENCY_RESPONSES: dict[int | str, dict[str, str]] = {
    status.HTTP_409_CONFLICT: {"description": "A request with this Idempotency-Key is already being processed."},
    status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "The idempotency store is unreachable; retry later."},
}

# Clients replay within seconds or minutes of a lost response; an hour covers that.
_RESPONSE_TTL_SECONDS = 60 * 60
# The in-flight marker only needs to outlive a normal create call; a crashed request
# self-heals when it expires.
_MARKER_TTL_SECONDS = 60
# Visible ASCII, no whitespace/control characters, safe to fold into a Redis key.
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
    idempotency_key: Annotated[str | None, Header(alias=IDEMPOTENCY_KEY_HEADER)] = None,
) -> str | None:
    return validate_idempotency_key(idempotency_key)


IdempotencyKeyDep = Annotated[str | None, Depends(_get_idempotency_key_header)]


def _cache_key(user_id: UUID, endpoint: str, idempotency_key: str) -> str:
    # user_id and endpoint are server-supplied, so the raw key cannot forge another scope.
    return f"idempotency:{user_id}:{endpoint}:{idempotency_key}"


def _body_hash(body: BaseModel) -> str:
    # The validated model, not the raw bytes: two encodings of the same payload must match.
    return hashlib.sha256(body.model_dump_json().encode()).hexdigest()


@dataclass
class IdempotentRequest:
    """Handle yielded by :func:`idempotent_request`."""

    redis: Redis
    cache_key: str | None
    body_hash: str = ""
    replay: JSONResponse | None = field(default=None, init=False)

    async def finish(self, status_code: int, body: object) -> None:
        """Store the completed response so a replay of this key returns it verbatim.

        Call *after* the ``async with`` block: the row is committed by then, and a
        serialization failure must not release the marker and let a retry duplicate it.
        """
        if self.cache_key is None or self.replay is not None:
            return
        payload = json.dumps({"hash": self.body_hash, "status": status_code, "body": body})
        await set_redis_value(self.redis, self.cache_key, payload, ex=_RESPONSE_TTL_SECONDS)


async def _load_replay(redis: Redis, cache_key: str, body_hash: str) -> JSONResponse:
    """Turn an already-claimed key into a replayed response, or raise the matching error."""
    stored = await get_redis_value(redis, cache_key)
    if stored is None:
        # Claimed a moment ago but gone now (marker expired mid-flight): treat as still running.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A request with this Idempotency-Key is already being processed.",
        )
    payload = json.loads(stored)
    if payload.get("hash") != body_hash:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Idempotency-Key was already used with a different request body.",
        )
    stored_status = payload.get("status")
    if stored_status is None:
        # Marker only: the first request claimed the key and is still running.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A request with this Idempotency-Key is already being processed.",
        )
    return JSONResponse(status_code=stored_status, content=payload["body"])


@asynccontextmanager
async def idempotent_request(
    redis: Redis,
    *,
    user_id: UUID,
    endpoint: str,
    key: str | None,
    body: BaseModel,
) -> AsyncIterator[IdempotentRequest]:
    """Claim *key* for *user_id*/*endpoint*/*body*, or hand back a prior result to replay.

    Wrap only the create-and-commit call::

        async with idempotent_request(redis, user_id=..., endpoint=..., key=..., body=payload) as idem:
            if idem.replay is not None:
                return idem.replay
            created = await create_record(...)
        result = serialize(created)
        await idem.finish(201, result.model_dump(mode="json"))

    An exception inside the block releases the in-flight marker so the client can retry at
    once. Raises 409 when another request with the same key is still running, 422 when the key
    was already used with a different body, and 503 (fail closed) when Redis is unreachable.
    """
    if key is None:
        yield IdempotentRequest(redis, None)
        return

    cache_key = _cache_key(user_id, endpoint, key)
    state = IdempotentRequest(redis, cache_key, _body_hash(body))
    marker = json.dumps({"hash": state.body_hash})
    claimed = await set_redis_value_nx(redis, cache_key, marker, ex=_MARKER_TTL_SECONDS)
    if claimed is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Idempotency store unavailable. Retry later.",
        )
    if not claimed:
        state.replay = await _load_replay(redis, cache_key, state.body_hash)
        yield state
        return

    try:
        yield state
    except Exception:
        # Nothing committed: drop the marker so the client need not wait out its TTL.
        await delete_redis_key(redis, cache_key)
        raise
