"""Compatibility wrapper for shared outbound HTTP client helpers."""

from app.core.clients.http import create_http_client
from app.core.config import settings

__all__ = ["create_http_client", "settings"]
