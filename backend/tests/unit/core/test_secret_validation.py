"""Tests for shared secret validation helpers."""

import pytest
from pydantic import SecretStr

from app.core.secrets import validate_min_secret_bytes


def test_validate_min_secret_bytes_returns_valid_secret() -> None:
    """Secrets at the byte-length floor should pass through unchanged."""
    secret = SecretStr("x" * 32)

    assert validate_min_secret_bytes(secret, "TEST_SECRET") is secret


def test_validate_min_secret_bytes_rejects_short_secret() -> None:
    """Short secrets should fail with the environment variable name."""
    with pytest.raises(ValueError, match="TEST_SECRET must be at least 32 bytes"):
        validate_min_secret_bytes(SecretStr("short"), "TEST_SECRET")
