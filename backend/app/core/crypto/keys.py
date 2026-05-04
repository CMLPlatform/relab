"""Key material helpers for application cryptography."""

from __future__ import annotations

import base64
import binascii

DATA_ENCRYPTION_KEY_BYTES = 32


def decode_data_encryption_key(value: str) -> bytes:
    """Decode a base64url AES-256 key and validate its length."""
    raw_value = value.strip()
    padded_value = raw_value + "=" * (-len(raw_value) % 4)
    try:
        key = base64.b64decode(padded_value.encode("ascii"), altchars=b"-_", validate=True)
    except (binascii.Error, UnicodeEncodeError) as exc:
        msg = "DATA_ENCRYPTION_KEY must be valid url-safe base64."
        raise ValueError(msg) from exc

    if len(key) != DATA_ENCRYPTION_KEY_BYTES:
        msg = "DATA_ENCRYPTION_KEY must decode to exactly 32 bytes."
        raise ValueError(msg)
    return key
