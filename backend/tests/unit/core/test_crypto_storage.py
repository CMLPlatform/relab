"""Tests for application-level cryptographic storage helpers."""
# spell-checker: ignore decryptable

from __future__ import annotations

import base64

import pytest
from pydantic import HttpUrl, SecretStr
from sqlalchemy.dialects import postgresql

from app.api.auth.models import OAuthAccount
from app.api.plugins.rpi_cam.models import RecordingSession
from app.core.config import CoreSettings, Environment
from app.core.crypto import storage
from app.core.crypto.keys import decode_data_encryption_key
from app.core.crypto.sqlalchemy import EncryptedString


def _b64_key(byte: int) -> str:
    return base64.urlsafe_b64encode(bytes([byte]) * 32).rstrip(b"=").decode("ascii")


def _set_key(monkeypatch: pytest.MonkeyPatch, key: str) -> None:
    monkeypatch.setattr(storage, "get_data_encryption_key_bytes", lambda: decode_data_encryption_key(key))


def test_encrypt_text_round_trips_and_uses_random_iv(monkeypatch: pytest.MonkeyPatch) -> None:
    """Encrypting the same plaintext twice should produce two decryptable ciphertexts."""
    _set_key(monkeypatch, _b64_key(1))

    first = storage.encrypt_text("oauth-token")
    second = storage.encrypt_text("oauth-token")

    assert first.startswith(storage.ENCRYPTED_TEXT_PREFIX)
    assert second.startswith(storage.ENCRYPTED_TEXT_PREFIX)
    assert first != second
    assert storage.decrypt_text(first) == "oauth-token"
    assert storage.decrypt_text(second) == "oauth-token"


def test_decrypt_text_rejects_tampered_ciphertext(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tampered encrypted values should fail closed instead of returning garbage."""
    _set_key(monkeypatch, _b64_key(2))
    encrypted = storage.encrypt_text("secret")
    tampered = encrypted[:-3] + "abc"

    with pytest.raises(RuntimeError, match="Failed to decrypt encrypted value"):
        storage.decrypt_text(tampered)


def test_decrypt_text_rejects_unencrypted_values(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unencrypted stored values should fail closed instead of being silently accepted."""
    _set_key(monkeypatch, _b64_key(3))

    with pytest.raises(RuntimeError, match="Value is not encrypted"):
        storage.decrypt_text("plain-token")


def test_decrypt_text_rejects_wrong_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """AES-GCM authentication should reject values encrypted with another key."""
    _set_key(monkeypatch, _b64_key(4))
    encrypted = storage.encrypt_text("secret")

    _set_key(monkeypatch, _b64_key(5))

    with pytest.raises(RuntimeError, match="Failed to decrypt encrypted value"):
        storage.decrypt_text(encrypted)


def test_encrypted_string_encrypts_bound_values_and_decrypts_stored_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SQLAlchemy field type should encrypt on write and decrypt prefixed values on read."""
    _set_key(monkeypatch, _b64_key(6))
    field = EncryptedString()
    dialect = postgresql.dialect()

    stored = field.process_bind_param("database-token", dialect=dialect)

    assert stored is not None
    assert stored != "database-token"
    assert stored.startswith(storage.ENCRYPTED_TEXT_PREFIX)
    assert field.process_result_value(stored, dialect=dialect) == "database-token"


def test_sensitive_models_use_encrypted_columns() -> None:
    """Reversible provider and broadcast secrets should use encrypted column types."""
    assert isinstance(OAuthAccount.__table__.c.access_token.type, EncryptedString)
    assert isinstance(OAuthAccount.__table__.c.refresh_token.type, EncryptedString)
    assert isinstance(RecordingSession.__table__.c.broadcast_key.type, EncryptedString)


def test_production_requires_data_encryption_key() -> None:
    """Production-like environments should not start without data-encryption keys."""
    with pytest.raises(ValueError, match="DATA_ENCRYPTION_KEY must not be empty"):
        CoreSettings(
            environment=Environment.PROD,
            backend_api_url=HttpUrl("https://api.cml-relab.org/"),
            site_public_url=HttpUrl("https://cml-relab.org/"),
            frontend_app_url=HttpUrl("https://app.cml-relab.org/"),
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            bootstrap_superuser_password=SecretStr("test-password"),
            bootstrap_superuser_email="admin@example.com",
            data_encryption_key=SecretStr(""),
        )


def test_development_requires_data_encryption_key_when_unset() -> None:
    """Development should provide explicit data-encryption key material."""
    with pytest.raises(ValueError, match="DATA_ENCRYPTION_KEY must not be empty"):
        CoreSettings(environment=Environment.DEV, data_encryption_key=SecretStr(""))


def test_data_encryption_key_bytes_accepts_32_byte_base64url_key() -> None:
    """Configured AES-GCM keys should decode to exactly 32 bytes."""
    settings = CoreSettings(environment=Environment.DEV, data_encryption_key=SecretStr(_b64_key(7)))

    assert settings.data_encryption_key_bytes == bytes([7]) * 32


def test_data_encryption_key_rejects_invalid_lengths() -> None:
    """AES-256-GCM key material must be exactly 32 bytes after decoding."""
    short_key = base64.urlsafe_b64encode(b"short").rstrip(b"=").decode("ascii")

    with pytest.raises(ValueError, match="DATA_ENCRYPTION_KEY must decode to exactly 32 bytes"):
        CoreSettings(environment=Environment.DEV, data_encryption_key=SecretStr(short_key))
