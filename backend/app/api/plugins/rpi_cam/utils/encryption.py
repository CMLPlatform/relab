"""Encryption utilities for the Raspberry Pi Camera plugin."""

import json
import secrets
from typing import TYPE_CHECKING

from cryptography.fernet import Fernet, InvalidToken

from app.api.plugins.rpi_cam.config import settings

if TYPE_CHECKING:
    from typing import Any


def _get_cipher() -> Fernet:
    """Return the configured Fernet cipher.

    Lazily constructing the cipher avoids import-time failures in commands like
    Alembic checks, where plugin models are imported but camera encryption is not used.
    """
    secret = settings.rpi_cam_plugin_secret
    if not secret:
        msg = "RPi camera encryption secret is not configured."
        raise RuntimeError(msg)

    try:
        return Fernet(secret)
    except ValueError as exc:
        msg = "RPi camera encryption secret must be a 32-byte url-safe base64 Fernet key."
        raise RuntimeError(msg) from exc


def generate_api_key(prefix: str = "CAM") -> str:
    """Generate a secure API key using URL-safe base64."""
    token = secrets.token_urlsafe()
    return f"{prefix}_{token}"


def encrypt_str(s: str) -> str:
    """Encrypts a string before storing it in the database."""
    return _get_cipher().encrypt(s.encode()).decode()


def decrypt_str(encrypted_key: str) -> str:
    """Decrypts a string when retrieving it from the database."""
    return _get_cipher().decrypt(encrypted_key.encode()).decode()


def encrypt_dict(data: dict[str, Any]) -> str:
    """Encrypt dictionary data using Fernet."""
    json_data = json.dumps(data)
    encrypted_data = _get_cipher().encrypt(json_data.encode())
    return encrypted_data.decode()


def decrypt_dict(encrypted: str) -> dict[str, Any]:
    """Decrypt data back to dictionary."""
    try:
        decrypted_data = _get_cipher().decrypt(encrypted.encode())
        return json.loads(decrypted_data)
    except InvalidToken as e:
        err_msg = f"Failed to decrypt data: {e}"
        raise RuntimeError(err_msg) from e
