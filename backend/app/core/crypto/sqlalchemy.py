"""SQLAlchemy types for cryptographic storage."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.core.crypto.storage import decrypt_text, encrypt_text

if TYPE_CHECKING:
    from sqlalchemy.engine.interfaces import Dialect


class EncryptedString(TypeDecorator[str]):
    """Encrypt string values on write and decrypt them on read."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:  # noqa: ARG002
        """Encrypt values before they are bound to SQL statements."""
        if value is None:
            return None
        return encrypt_text(value)

    def process_result_value(self, value: str | None, dialect: Dialect) -> str | None:  # noqa: ARG002
        """Decrypt database values after loading them from result rows."""
        if value is None:
            return None
        return decrypt_text(value)
