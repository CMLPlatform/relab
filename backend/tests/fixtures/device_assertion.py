"""Signed RPi camera device assertions for tests."""

import base64
import secrets
import time
from typing import TYPE_CHECKING

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from app.api.plugins.rpi_cam.device_assertion import ASSERTION_AUDIENCE

if TYPE_CHECKING:
    from uuid import UUID


def make_keypair() -> tuple[ec.EllipticCurvePrivateKey, dict]:
    """Generate an EC P-256 key pair and return (private_key, public_jwk)."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    pub = private_key.public_key().public_numbers()

    def _b64(n: int) -> str:
        return base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode()

    return private_key, {"kty": "EC", "crv": "P-256", "x": _b64(pub.x), "y": _b64(pub.y)}


def sign_assertion(
    private_key: ec.EllipticCurvePrivateKey,
    camera_id: UUID | str,
    key_id: str,
    *,
    aud: str = ASSERTION_AUDIENCE,
    exp_offset: int = 120,
    iss: str | None = None,
    sub: str | None = None,
    jti: str | None = None,
    omit_claims: set[str] | None = None,
    headers: dict[str, object] | None = None,
) -> str:
    """Sign a device assertion for ``camera_id``; ``jti=""`` is kept as given."""
    now = int(time.time())
    payload = {
        "iss": iss or f"camera:{camera_id}",
        "sub": sub or f"camera:{camera_id}",
        "aud": aud,
        "iat": now,
        "nbf": now,
        "exp": now + exp_offset,
        "jti": jti if jti is not None else secrets.token_urlsafe(24),
    }
    for claim in omit_claims or set():
        payload.pop(claim, None)
    return jwt.encode(payload, private_key, algorithm="ES256", headers=headers or {"kid": key_id})
