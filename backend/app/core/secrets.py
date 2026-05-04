"""Shared helpers for validating runtime secrets."""

from __future__ import annotations

from pydantic import SecretStr

MIN_SECRET_BYTES = 32


def validate_min_secret_bytes(value: SecretStr, env_name: str) -> SecretStr:
    """Validate that a secret meets the runtime byte-length floor."""
    if len(value.get_secret_value().encode("utf-8")) < MIN_SECRET_BYTES:
        msg = f"{env_name} must be at least {MIN_SECRET_BYTES} bytes."
        raise ValueError(msg)
    return value
