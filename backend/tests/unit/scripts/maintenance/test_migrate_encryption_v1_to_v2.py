"""Tests for the one-time encryption migration script."""
# spell-checker: ignore aesgcm

from __future__ import annotations

import base64
from typing import TYPE_CHECKING

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from scripts.maintenance import migrate_encryption_v1_to_v2 as migration

if TYPE_CHECKING:
    from pathlib import Path


def _aes_key() -> str:
    return base64.urlsafe_b64encode(bytes(range(32))).rstrip(b"=").decode("ascii")


def test_encrypt_v2_writes_aesgcm_prefixed_value() -> None:
    """Migrated values should use the same v2 AES-GCM envelope as runtime storage."""
    key_raw = _aes_key()
    aesgcm = migration.load_aesgcm(key_raw)

    encrypted = migration.encrypt_v2(aesgcm, "new-token")

    assert encrypted.startswith(migration.V2_PREFIX)
    token = encrypted.removeprefix(migration.V2_PREFIX)
    padded_token = token + "=" * (-len(token) % 4)
    encrypted_bytes = base64.b64decode(padded_token.encode("ascii"), altchars=b"-_")
    nonce = encrypted_bytes[: migration.AESGCM_NONCE_BYTES]
    ciphertext = encrypted_bytes[migration.AESGCM_NONCE_BYTES :]
    key_bytes = base64.b64decode((key_raw + "=" * (-len(key_raw) % 4)).encode("ascii"), altchars=b"-_")
    assert AESGCM(key_bytes).decrypt(nonce, ciphertext, None) == b"new-token"


def test_migrate_value_encrypts_plaintext_prod_values() -> None:
    """Prod values from the current deployed SHA are plaintext and should be encrypted directly."""
    aesgcm = migration.load_aesgcm(_aes_key())

    migrated = migration.migrate_value("plain-prod-token", aesgcm)

    assert migrated is not None
    assert migrated.startswith(migration.V2_PREFIX)


def test_migrate_value_skips_current_v2_values() -> None:
    """Already migrated values should stay untouched so the script is idempotent."""
    aesgcm = migration.load_aesgcm(_aes_key())
    existing = f"{migration.V2_PREFIX}already-migrated"

    assert migration.migrate_value(existing, aesgcm) is None


def test_load_aesgcm_rejects_wrong_key_length() -> None:
    """AES-GCM migration keys should decode to exactly 32 bytes."""
    short_key = base64.urlsafe_b64encode(b"short").rstrip(b"=").decode("ascii")

    with pytest.raises(ValueError, match="DATA_ENCRYPTION_KEY must decode to exactly 32 bytes"):
        migration.load_aesgcm(short_key)


def test_get_env_secret_prefers_direct_value(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Direct env vars should win over *_FILE fallbacks."""
    secret_file = tmp_path / "secret"
    secret_file.write_text("from-file", encoding="utf-8")
    monkeypatch.setenv("DATABASE_APP_PASSWORD", "from-env")
    monkeypatch.setenv("DATABASE_APP_PASSWORD_FILE", str(secret_file))

    assert migration.get_env_secret("DATABASE_APP_PASSWORD") == "from-env"


def test_get_env_secret_reads_file_fallback(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Docker-style *_FILE env vars should be usable by the migration script."""
    secret_file = tmp_path / "secret"
    secret_file.write_text("from-file\n", encoding="utf-8")
    monkeypatch.delenv("DATABASE_APP_PASSWORD", raising=False)
    monkeypatch.setenv("DATABASE_APP_PASSWORD_FILE", str(secret_file))

    assert migration.get_env_secret("DATABASE_APP_PASSWORD") == "from-file"
