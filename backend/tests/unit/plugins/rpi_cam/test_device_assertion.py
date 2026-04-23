"""Unit tests for the device-assertion module's missing branches.

The happy/unhappy paths of :func:`verify_device_assertion` are covered in
``test_websocket_router.py``; this module fills the remaining gaps:
missing ``jti``, bearer extraction, and the ``_authenticated_camera`` FastAPI
dependency.
"""
# ruff: noqa: SLF001 — private members are the subject under test

from __future__ import annotations

import base64
import secrets
import time
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException, status

from app.api.plugins.rpi_cam import device_assertion as da


def _make_keypair() -> tuple[ec.EllipticCurvePrivateKey, dict]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    pub = private_key.public_key().public_numbers()

    def _b64(n: int) -> str:
        return base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode()

    return private_key, {"kty": "EC", "crv": "P-256", "x": _b64(pub.x), "y": _b64(pub.y)}


def _make_camera(key_id: str = "kid-1", *, active: bool = True) -> tuple[MagicMock, ec.EllipticCurvePrivateKey]:
    """Build a camera mock + its signing key. The key is returned separately to avoid poking private attrs."""
    private_key, jwk = _make_keypair()
    camera = MagicMock()
    camera.id = uuid4()
    camera.relay_key_id = key_id
    camera.relay_public_key_jwk = jwk
    camera.credential_is_active = active
    return camera, private_key


def _sign(
    camera: MagicMock,
    private_key: ec.EllipticCurvePrivateKey,
    *,
    jti: str | None = None,
    exp_offset: int = 120,
    omit_jti: bool = False,
) -> str:
    now = int(time.time())
    payload: dict = {
        "iss": f"camera:{camera.id}",
        "sub": f"camera:{camera.id}",
        "aud": da.ASSERTION_AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": now + exp_offset,
    }
    if not omit_jti:
        payload["jti"] = jti if jti is not None else secrets.token_urlsafe(24)
    return jwt.encode(
        payload,
        private_key,
        algorithm="ES256",
        headers={"kid": camera.relay_key_id},
    )


# ── verify_device_assertion: missing jti ─────────────────────────────────────


class TestVerifyMissingJti:
    """Cover the explicit jti-string validation that runs after PyJWT's decode."""

    async def test_empty_jti_rejected(self) -> None:
        """An empty jti claim should be rejected before Redis is consulted."""
        camera, private_key = _make_camera()
        redis = AsyncMock()
        assertion = _sign(camera, private_key, jti="")
        with pytest.raises(jwt.InvalidTokenError):
            await da.verify_device_assertion(assertion, camera, redis)
        redis.set.assert_not_called()


# ── TTL helper ───────────────────────────────────────────────────────────────


class TestAssertionReplayTtl:
    """Cover the replay-window TTL bounds helper."""

    def test_clamps_to_max(self) -> None:
        """TTLs far in the future are clamped to the configured maximum."""
        now = int(time.time())
        huge_exp = now + 10 * da.MAX_ASSERTION_TTL_SECONDS
        assert da._assertion_replay_ttl({"exp": huge_exp}) == da.MAX_ASSERTION_TTL_SECONDS

    def test_floor_of_one(self) -> None:
        """Already-expired tokens still use a TTL >= 1 so SET NX succeeds."""
        now = int(time.time())
        assert da._assertion_replay_ttl({"exp": now - 100}) == 1


# ── _extract_bearer ──────────────────────────────────────────────────────────


class TestExtractBearer:
    """Cover bearer-token extraction from the Authorization header."""

    async def test_extracts_token(self) -> None:
        """A valid Bearer header yields the raw token."""
        request = MagicMock()
        request.headers = {"Authorization": "Bearer abc.def.ghi"}
        assert await da._extract_bearer(request) == "abc.def.ghi"

    async def test_missing_header_raises_401(self) -> None:
        """Requests without an Authorization header get a 401 + WWW-Authenticate challenge."""
        request = MagicMock()
        request.headers = {}
        with pytest.raises(HTTPException) as exc_info:
            await da._extract_bearer(request)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
        assert exc_info.value.headers == {"WWW-Authenticate": "Bearer"}

    async def test_bearer_prefix_only_raises(self) -> None:
        """A Bearer header with no token body is treated the same as a missing header."""
        request = MagicMock()
        request.headers = {"Authorization": "Bearer "}
        with pytest.raises(HTTPException):
            await da._extract_bearer(request)


# ── _authenticated_camera dependency ─────────────────────────────────────────


def _request_with_auth(assertion: str = "placeholder") -> MagicMock:
    request = MagicMock()
    request.headers = {"Authorization": f"Bearer {assertion}"}
    return request


class TestAuthenticatedCameraDep:
    """Cover the FastAPI dependency that resolves and authenticates a camera per request."""

    async def test_unknown_camera_returns_401(self) -> None:
        """If the camera row doesn't exist, the dep returns 401 (don't leak existence)."""
        session = MagicMock()
        session.get = AsyncMock(return_value=None)
        request = _request_with_auth()

        with pytest.raises(HTTPException) as exc_info:
            await da._authenticated_camera(request, uuid4(), session)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_inactive_credential_returns_401(self) -> None:
        """A camera whose credential has been deactivated must not authenticate."""
        camera, _ = _make_camera(active=False)
        session = MagicMock()
        session.get = AsyncMock(return_value=camera)
        request = _request_with_auth()

        with pytest.raises(HTTPException) as exc_info:
            await da._authenticated_camera(request, camera.id, session)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_redis_unavailable_returns_503(self) -> None:
        """Without Redis we cannot enforce replay protection, so we fail closed with 503."""
        camera, _ = _make_camera()
        session = MagicMock()
        session.get = AsyncMock(return_value=camera)
        request = _request_with_auth()

        with (
            patch.object(da, "get_connection_redis", return_value=None),
            pytest.raises(HTTPException) as exc_info,
        ):
            await da._authenticated_camera(request, camera.id, session)
        assert exc_info.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    async def test_invalid_assertion_returns_401(self) -> None:
        """A malformed JWT in the Authorization header is rejected with 401."""
        camera, _ = _make_camera()
        session = MagicMock()
        session.get = AsyncMock(return_value=camera)
        redis = AsyncMock()
        request = _request_with_auth("not-a-jwt")

        with (
            patch.object(da, "get_connection_redis", return_value=redis),
            pytest.raises(HTTPException) as exc_info,
        ):
            await da._authenticated_camera(request, camera.id, session)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_valid_assertion_returns_camera(self) -> None:
        """A valid, unseen assertion authenticates and returns the camera row."""
        camera, private_key = _make_camera()
        session = MagicMock()
        session.get = AsyncMock(return_value=camera)
        redis = AsyncMock()
        redis.set = AsyncMock(return_value=True)
        assertion = _sign(camera, private_key)
        request = _request_with_auth(assertion)

        with patch.object(da, "get_connection_redis", return_value=redis):
            result = await da._authenticated_camera(request, camera.id, session)
        assert result is camera
        redis.set.assert_awaited_once()

    async def test_replayed_assertion_returns_401(self) -> None:
        """Re-use of a previously-seen jti is rejected as replay and surfaces as 401."""
        camera, private_key = _make_camera()
        session = MagicMock()
        session.get = AsyncMock(return_value=camera)
        redis = AsyncMock()
        redis.set = AsyncMock(return_value=None)  # nx failed → replay
        assertion = _sign(camera, private_key)
        request = _request_with_auth(assertion)

        with (
            patch.object(da, "get_connection_redis", return_value=redis),
            pytest.raises(HTTPException) as exc_info,
        ):
            await da._authenticated_camera(request, camera.id, session)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
