"""Authenticated encryption helpers for reversible sensitive values."""
# spell-checker: ignore AESGCM

from __future__ import annotations

import base64
import binascii
import secrets
from functools import cache

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

ENCRYPTED_TEXT_PREFIX = "relab:v2:aesgcm:"
AESGCM_NONCE_BYTES = 12


def get_data_encryption_key_bytes() -> bytes:
    """Return configured AES-256-GCM key material."""
    return settings.data_encryption_key_bytes


def is_encrypted(value: str | None) -> bool:
    """Return whether a stored string carries RELab's encrypted-value prefix."""
    return bool(value and value.startswith(ENCRYPTED_TEXT_PREFIX))


def encrypt_text(value: str) -> str:
    """Encrypt a text value unless it already carries the encrypted-value prefix."""
    if is_encrypted(value):
        return value
    nonce = secrets.token_bytes(AESGCM_NONCE_BYTES)
    ciphertext = _get_cipher(get_data_encryption_key_bytes()).encrypt(nonce, value.encode("utf-8"), None)
    token = base64.urlsafe_b64encode(nonce + ciphertext).rstrip(b"=").decode("ascii")
    return f"{ENCRYPTED_TEXT_PREFIX}{token}"


def decrypt_text(value: str) -> str:
    """Decrypt an encrypted text value."""
    if not is_encrypted(value):
        msg = "Value is not encrypted."
        raise RuntimeError(msg)

    token = value.removeprefix(ENCRYPTED_TEXT_PREFIX)
    try:
        encrypted = _decode_token(token)
        nonce = encrypted[:AESGCM_NONCE_BYTES]
        ciphertext = encrypted[AESGCM_NONCE_BYTES:]
        return _get_cipher(get_data_encryption_key_bytes()).decrypt(nonce, ciphertext, None).decode("utf-8")
    except (InvalidTag, ValueError, UnicodeDecodeError) as exc:
        msg = "Failed to decrypt encrypted value."
        raise RuntimeError(msg) from exc


@cache
def _get_cipher(key: bytes) -> AESGCM:
    return AESGCM(key)


def _decode_token(token: str) -> bytes:
    padded_token = token + "=" * (-len(token) % 4)
    try:
        encrypted = base64.b64decode(padded_token.encode("ascii"), altchars=b"-_", validate=True)
    except (binascii.Error, UnicodeEncodeError) as exc:
        msg = "Encrypted value is not valid base64url."
        raise ValueError(msg) from exc

    if len(encrypted) <= AESGCM_NONCE_BYTES:
        msg = "Encrypted value is too short."
        raise ValueError(msg)
    return encrypted
