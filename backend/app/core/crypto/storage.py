"""Authenticated encryption helpers for reversible sensitive values."""

from __future__ import annotations

from functools import cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from app.core.config import settings

ENCRYPTED_TEXT_PREFIX = "relab:v1:fernet:"


def get_data_encryption_keys() -> list[str]:
    """Return configured data-encryption keys in keyring order."""
    return settings.data_encryption_key_values


def is_encrypted(value: str | None) -> bool:
    """Return whether a stored string carries RELab's encrypted-value prefix."""
    return bool(value and value.startswith(ENCRYPTED_TEXT_PREFIX))


def encrypt_text(value: str) -> str:
    """Encrypt a text value unless it already carries the encrypted-value prefix."""
    if is_encrypted(value):
        return value
    token = _get_cipher(tuple(get_data_encryption_keys())).encrypt(value.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_TEXT_PREFIX}{token}"


def decrypt_text(value: str) -> str:
    """Decrypt an encrypted text value."""
    if not is_encrypted(value):
        msg = "Value is not encrypted."
        raise RuntimeError(msg)

    token = value.removeprefix(ENCRYPTED_TEXT_PREFIX)
    try:
        return _get_cipher(tuple(get_data_encryption_keys())).decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        msg = "Failed to decrypt encrypted value."
        raise RuntimeError(msg) from exc


@cache
def _get_cipher(keys: tuple[str, ...]) -> MultiFernet:
    if not keys:
        msg = "DATA_ENCRYPTION_KEYS is not configured."
        raise RuntimeError(msg)

    try:
        return MultiFernet([Fernet(key.encode("ascii")) for key in keys])
    except (TypeError, ValueError) as exc:
        msg = "DATA_ENCRYPTION_KEYS must contain valid 32-byte url-safe base64 Fernet keys."
        raise RuntimeError(msg) from exc
