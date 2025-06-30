"""Encryption utilities for the Raspberry Pi Camera plugin."""

import json
import secrets
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.api.plugins.rpi_cam.config import settings

# Initialize the Fernet cipher
CIPHER = Fernet(settings.rpi_cam_plugin_secret)


def generate_api_key(prefix: str = "CAM") -> str:
    """Generate a secure API key using URL-safe base64."""
    token = secrets.token_urlsafe()
    return f"{prefix}_{token}"


def encrypt_str(s: str) -> str:
    """Encrypts a string before storing it in the database."""
    return CIPHER.encrypt(s.encode()).decode()


def decrypt_str(encrypted_key: str) -> str:
    """Decrypts a string when retrieving it from the database."""
    return CIPHER.decrypt(encrypted_key.encode()).decode()


def encrypt_dict(data: dict[str, Any]) -> str:
    """Encrypt dictionary data using Fernet."""
    json_data = json.dumps(data)
    encrypted_data = CIPHER.encrypt(json_data.encode())
    return encrypted_data.decode()


def decrypt_dict(encrypted: str) -> dict[str, Any]:
    """Decrypt data back to dictionary."""
    try:
        decrypted_data = CIPHER.decrypt(encrypted.encode())
        return json.loads(decrypted_data)
    except InvalidToken as e:
        err_msg = f"Failed to decrypt data: {e}"
        raise RuntimeError(err_msg) from e
