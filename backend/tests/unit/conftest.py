"""Shared fixtures for unit tests (no database required)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture
def mock_session() -> AsyncMock:
    """Async database session mock with common SQLAlchemy methods.

    Synchronous methods (add, add_all) use MagicMock; async methods use AsyncMock.
    Tests can further configure return values on this mock as needed.
    """
    session = AsyncMock()
    # Synchronous in SQLAlchemy
    session.add = MagicMock()
    session.add_all = MagicMock()
    return session
