"""Tests for test database identifier validation and quoting."""
# Private test harness helpers are the behavior under test here.
# ruff: noqa: SLF001

from __future__ import annotations

import pytest

from tests import conftest as test_config


def test_quoted_test_database_identifier_quotes_safe_name() -> None:
    """Safe test database names should become quoted PostgreSQL identifiers."""
    assert test_config._quoted_test_database_identifier("test_relab_gw0") == '"test_relab_gw0"'


@pytest.mark.parametrize(
    "database_name",
    [
        "test-relab",
        "test_relab; DROP DATABASE postgres; --",
        "1test_relab",
        "test relab",
    ],
)
def test_quoted_test_database_identifier_rejects_unsafe_name(database_name: str) -> None:
    """Unsafe names should fail before raw CREATE/DROP DATABASE SQL is built."""
    with pytest.raises(ValueError, match="Unsafe test database name"):
        test_config._quoted_test_database_identifier(database_name)


def test_worker_test_database_name_rejects_unsafe_env_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """The xdist-aware environment path should use the same database-name allowlist."""
    monkeypatch.setenv("POSTGRES_TEST_DB", "test_relab; DROP DATABASE postgres; --")
    monkeypatch.delenv("PYTEST_XDIST_WORKER", raising=False)

    with pytest.raises(ValueError, match="Unsafe test database name"):
        test_config._get_worker_test_db_name()
