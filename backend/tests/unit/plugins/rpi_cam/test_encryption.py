"""Unit tests for the RPi Cam Fernet encryption helpers."""
# spell-checker: ignore usefixtures

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet, InvalidToken

from app.api.plugins.rpi_cam.utils import encryption

VALID_KEY = Fernet.generate_key().decode()


@pytest.fixture
def _configured_secret(monkeypatch: pytest.MonkeyPatch) -> str:
    """Set a valid Fernet secret on the plugin settings singleton."""
    monkeypatch.setattr(encryption.settings, "rpi_cam_plugin_secret", VALID_KEY)
    return VALID_KEY


@pytest.mark.usefixtures("_configured_secret")
class TestStringRoundTrip:
    """Encrypting and decrypting a string should return the original string."""

    def test_encrypt_decrypt_returns_original(self) -> None:
        """A string encrypted and then decrypted should yield the original string."""
        plaintext = "CAM_super-secret-api-key"
        ciphertext = encryption.encrypt_str(plaintext)
        assert ciphertext != plaintext
        assert encryption.decrypt_str(ciphertext) == plaintext

    def test_encrypt_is_non_deterministic(self) -> None:
        """Fernet embeds a random IV; two encryptions of the same plaintext must differ."""
        assert encryption.encrypt_str("same") != encryption.encrypt_str("same")


@pytest.mark.usefixtures("_configured_secret")
class TestDictRoundTrip:
    """Encrypting and decrypting a dict should preserve structure and content."""

    def test_encrypt_decrypt_preserves_structure(self) -> None:
        """A dict encrypted and then decrypted should yield the original dict, even when nested."""
        payload = {"kid": "abc", "nested": {"n": 1}, "list": [1, 2, 3]}
        ciphertext = encryption.encrypt_dict(payload)
        assert encryption.decrypt_dict(ciphertext) == payload

    def test_decrypt_dict_raises_on_tampered_token(self) -> None:
        """A tampered token (one whose MAC doesn't verify) should raise a controlled RuntimeError."""
        ciphertext = encryption.encrypt_dict({"k": "v"})
        # Flip a character in the middle to corrupt the MAC.
        tampered = ciphertext[:-4] + ("A" if ciphertext[-1] != "A" else "B") + ciphertext[-3:]
        with pytest.raises(RuntimeError, match="Failed to decrypt"):
            encryption.decrypt_dict(tampered)

    def test_decrypt_dict_raises_on_garbage_input(self) -> None:
        """A non-Fernet token surfaces as a controlled RuntimeError, not a cryptography exception."""
        with pytest.raises(RuntimeError, match="Failed to decrypt"):
            encryption.decrypt_dict("not-a-fernet-token")


class TestSecretConfiguration:
    """Tests for handling of the Fernet secret configuration."""

    def test_missing_secret_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A missing secret is a config error that must be fixed by the operator; fail loudly."""
        monkeypatch.setattr(encryption.settings, "rpi_cam_plugin_secret", "")
        with pytest.raises(RuntimeError, match="not configured"):
            encryption.encrypt_str("x")

    def test_invalid_secret_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The Fernet key must be a url-safe base64-encoded 32-byte value; anything else is a config error."""
        monkeypatch.setattr(encryption.settings, "rpi_cam_plugin_secret", "not-a-valid-fernet-key")
        with pytest.raises(RuntimeError, match="url-safe base64 Fernet key"):
            encryption.encrypt_str("x")

    def test_ciphertext_from_one_key_fails_under_another(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Rotating keys without re-encrypting must surface as a decrypt failure, not silent mis-data."""
        monkeypatch.setattr(encryption.settings, "rpi_cam_plugin_secret", VALID_KEY)
        ciphertext = encryption.encrypt_str("secret")

        other_key = Fernet.generate_key().decode()
        monkeypatch.setattr(encryption.settings, "rpi_cam_plugin_secret", other_key)
        with pytest.raises(InvalidToken):
            encryption.decrypt_str(ciphertext)


class TestApiKeyGeneration:
    """Tests for API key generation helper."""

    def test_default_prefix(self) -> None:
        """Generated keys use the default camera prefix."""
        key = encryption.generate_api_key()
        assert key.startswith("CAM_")
        assert len(key) > len("CAM_") + 20

    def test_custom_prefix(self) -> None:
        """Generated keys allow a custom prefix."""
        assert encryption.generate_api_key(prefix="RELAY").startswith("RELAY_")

    def test_keys_are_unique(self) -> None:
        """Two generated keys should not match."""
        assert encryption.generate_api_key() != encryption.generate_api_key()
