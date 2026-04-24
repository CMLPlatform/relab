"""Shared fixtures for unit tests (no database required)."""
# spell-checker: ignore fixturenames

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock

import pytest

if TYPE_CHECKING:
    from typing import Any

_FORBIDDEN_UNIT_FIXTURES = {
    "async_engine",
    "db_session",
    "relab_alembic_config",
    "test_database_name",
}


@pytest.fixture
def mock_session() -> Any:  # noqa: ANN401
    """Async database session mock with common SQLAlchemy methods.

    Returns ``Any`` so the mock slots into parameters typed as ``AsyncSession`` (or anything
    else) without per-call-site casts. Runtime shape is an ``AsyncMock`` with ``add``/
    ``add_all`` as synchronous ``MagicMock`` attributes.
    """
    session = AsyncMock()
    # Synchronous in SQLAlchemy
    session.add = MagicMock()
    session.add_all = MagicMock()
    return session


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    """Fail fast when unit tests accidentally depend on DB-backed fixtures."""
    violations: list[str] = []

    for item in items:
        item_path = Path(str(item.fspath))
        if "tests/unit/" not in item_path.as_posix():
            continue

        fixture_names: list[str] = getattr(item, "fixturenames", [])
        forbidden = sorted(_FORBIDDEN_UNIT_FIXTURES.intersection(fixture_names))
        if forbidden:
            violations.append(f"{item.nodeid}: forbidden fixtures in unit tier: {', '.join(forbidden)}")

    if violations:
        msg = "\n".join(violations)
        error_message = f"Unit tests must stay database-free.\n{msg}"
        raise pytest.UsageError(error_message)
