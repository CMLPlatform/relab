"""Tests for application-level cryptographic storage helpers."""
# spell-checker: ignore decryptable, multifernet

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from pydantic import HttpUrl, SecretStr
from sqlalchemy.dialects import postgresql

from app.api.auth.models import OAuthAccount
from app.api.plugins.rpi_cam.models import RecordingSession
from app.core.config import CoreSettings, Environment
from app.core.crypto import storage
from app.core.crypto.sqlalchemy import EncryptedString


def _set_keys(monkeypatch: pytest.MonkeyPatch, keys: list[str]) -> None:
    monkeypatch.setattr(storage, "get_data_encryption_keys", lambda: keys)


def test_encrypt_text_round_trips_and_uses_random_iv(monkeypatch: pytest.MonkeyPatch) -> None:
    """Encrypting the same plaintext twice should produce two decryptable ciphertexts."""
    key = Fernet.generate_key().decode()
    _set_keys(monkeypatch, [key])

    first = storage.encrypt_text("oauth-token")
    second = storage.encrypt_text("oauth-token")

    assert first.startswith(storage.ENCRYPTED_TEXT_PREFIX)
    assert second.startswith(storage.ENCRYPTED_TEXT_PREFIX)
    assert first != second
    assert storage.decrypt_text(first) == "oauth-token"
    assert storage.decrypt_text(second) == "oauth-token"


def test_decrypt_text_rejects_tampered_ciphertext(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tampered encrypted values should fail closed instead of returning garbage."""
    key = Fernet.generate_key().decode()
    _set_keys(monkeypatch, [key])
    encrypted = storage.encrypt_text("secret")
    tampered = encrypted[:-3] + "abc"

    with pytest.raises(RuntimeError, match="Failed to decrypt encrypted value"):
        storage.decrypt_text(tampered)


def test_decrypt_text_rejects_unencrypted_values(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unencrypted stored values should fail closed instead of being silently accepted."""
    key = Fernet.generate_key().decode()
    _set_keys(monkeypatch, [key])

    with pytest.raises(RuntimeError, match="Value is not encrypted"):
        storage.decrypt_text("plain-token")


def test_multifernet_decrypts_old_key_and_encrypts_with_primary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keyrings should support rotation by decrypting old keys while using the first key for writes."""
    new_key = Fernet.generate_key().decode()
    old_key = Fernet.generate_key().decode()
    old_ciphertext = storage.ENCRYPTED_TEXT_PREFIX + Fernet(old_key.encode()).encrypt(b"old-value").decode()
    _set_keys(monkeypatch, [new_key, old_key])

    encrypted = storage.encrypt_text("new-value")

    assert storage.decrypt_text(old_ciphertext) == "old-value"
    encrypted_token = encrypted.removeprefix(storage.ENCRYPTED_TEXT_PREFIX)
    assert Fernet(new_key.encode()).decrypt(encrypted_token.encode()) == b"new-value"


def test_encrypted_string_encrypts_bound_values_and_decrypts_stored_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SQLAlchemy field type should encrypt on write and decrypt prefixed values on read."""
    key = Fernet.generate_key().decode()
    _set_keys(monkeypatch, [key])
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


def test_production_requires_data_encryption_keys() -> None:
    """Production-like environments should not start without data-encryption keys."""
    with pytest.raises(ValueError, match="DATA_ENCRYPTION_KEYS must not be empty"):
        CoreSettings(
            environment=Environment.PROD,
            backend_api_url=HttpUrl("https://api.cml-relab.org/"),
            frontend_web_url=HttpUrl("https://cml-relab.org/"),
            frontend_app_url=HttpUrl("https://app.cml-relab.org/"),
            postgres_password=SecretStr("test-password"),
            redis_password=SecretStr("test-password"),
            superuser_password=SecretStr("test-password"),
            superuser_email="admin@example.com",
            data_encryption_keys=SecretStr(""),
        )


def test_development_uses_test_data_encryption_key_when_unset() -> None:
    """Development can run local flows without configuring production key material."""
    settings = CoreSettings(environment=Environment.DEV, data_encryption_keys=SecretStr(""))

    assert settings.data_encryption_key_values == ["AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="]
