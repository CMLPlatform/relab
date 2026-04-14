"""Shared device-assertion verification used by the WebSocket relay and HTTP endpoints.

Both transports accept the same ES256 JWT minted by the Pi (``build_device_assertion``
in ``relab-rpi-cam-plugin/app/utils/device_jwt.py``): the audience is shared, the
replay-protection namespace in Redis is shared, and the verification logic is
therefore identical. Keeping it in one place prevents drift between the two
code paths.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated, Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import InvalidTokenError, PyJWK
from pydantic import UUID4

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam.models import Camera
from app.core.logging import sanitize_log_value

if TYPE_CHECKING:
    from collections.abc import Mapping

    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

ASSERTION_AUDIENCE = "relab-rpi-cam-relay"
ASSERTION_ALGORITHMS = ("ES256",)
REPLAY_KEY_PREFIX = "rpi_cam:relay_assertion_jti:"
MAX_ASSERTION_TTL_SECONDS = 5 * 60


async def verify_device_assertion(assertion: str, camera: Camera, redis: Redis) -> dict[str, Any]:
    """Validate a device assertion against a camera's stored credential.

    Raises ``InvalidTokenError`` on any check failure. Returns the decoded JWT
    payload (with the ``kid`` header appended) on success. Replay protection is
    enforced via a one-shot Redis ``SET NX`` keyed by ``{camera.id}:{jti}``.
    """
    header = jwt.get_unverified_header(assertion)
    if header.get("alg") not in ASSERTION_ALGORITHMS:
        msg = "Unsupported assertion algorithm"
        raise InvalidTokenError(msg)
    if header.get("kid") != camera.relay_key_id:
        msg_0 = "Assertion key id does not match camera credential"
        raise InvalidTokenError(msg_0)

    public_key = PyJWK.from_dict(camera.relay_public_key_jwk).key
    payload = jwt.decode(
        assertion,
        key=public_key,
        algorithms=list(ASSERTION_ALGORITHMS),
        audience=ASSERTION_AUDIENCE,
        options={"require": ["exp", "iat", "nbf", "jti", "sub"]},
    )
    expected_subject = f"camera:{camera.id}"
    if payload.get("sub") != expected_subject:
        msg_1 = "Assertion subject does not match camera"
        raise InvalidTokenError(msg_1)

    jti = str(payload.get("jti") or "")
    if not jti:
        msg_2 = "Missing assertion id"
        raise InvalidTokenError(msg_2)
    ttl = _assertion_replay_ttl(payload)
    was_set = await redis.set(f"{REPLAY_KEY_PREFIX}{camera.id}:{jti}", "1", ex=ttl, nx=True)
    if not was_set:
        msg_3 = "Assertion replay detected"
        raise InvalidTokenError(msg_3)
    payload["kid"] = header.get("kid")
    return payload


def _assertion_replay_ttl(payload: Mapping[str, Any]) -> int:
    exp = int(payload["exp"])
    now = int(datetime.now(UTC).timestamp())
    return max(1, min(exp - now, MAX_ASSERTION_TTL_SECONDS))


async def _extract_bearer(request: Request) -> str:
    raw_auth = request.headers.get("Authorization", "")
    token = raw_auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


async def _authenticated_camera(
    request: Request,
    camera_id: UUID4,
    session: AsyncSessionDep,
) -> Camera:
    """FastAPI dependency: resolve a Camera from the path param + validate its bearer token."""
    assertion = await _extract_bearer(request)
    camera: Camera | None = await session.get(Camera, camera_id)
    if camera is None or not camera.credential_is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication failed.")

    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        )

    try:
        await verify_device_assertion(assertion, camera, redis)
    except InvalidTokenError as exc:
        logger.warning(
            "Camera %s HTTP assertion rejected: %s",
            sanitize_log_value(camera_id),
            sanitize_log_value(str(exc)),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication failed.") from exc
    return camera


AuthenticatedCameraDep = Annotated[Camera, Depends(_authenticated_camera)]
"""FastAPI dep that yields the Camera row matching ``camera_id`` after verifying
the Bearer device assertion. Use on any endpoint the Pi itself calls."""


__all__ = [
    "ASSERTION_ALGORITHMS",
    "ASSERTION_AUDIENCE",
    "MAX_ASSERTION_TTL_SECONDS",
    "REPLAY_KEY_PREFIX",
    "AuthenticatedCameraDep",
    "verify_device_assertion",
]
