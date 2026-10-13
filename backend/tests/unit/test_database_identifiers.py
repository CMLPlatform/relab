"""Tests for test database identifier validation and quoting."""
# Private test harness helpers are the behavior under test here.

import pytest

from tests import conftest as test_config


def test_quoted_test_database_identifier_quotes_safe_name() -> None:
    """Safe test database names should become quoted PostgreSQL identifiers."""
    assert test_config._quoted_test_database_identifier("test_r9lab_gw0") == '"test_r9lab_gw0"'


@pytest.mark.parametrize(
    "database_name",
    [
        "test-r9lab",
        "test_r9lab; DROP DATABASE postgres; --",
        "1test_r9lab",
        "test r9lab",
    ],
)
def test_quoted_test_database_identifier_rejects_unsafe_name(database_name: str) -> None:
    """Unsafe names should fail before raw CREATE/DROP DATABASE SQL is built."""
    with pytest.raises(ValueError, match="Unsafe test database name"):
        test_config._quoted_test_database_identifier(database_name)


def test_worker_test_database_name_rejects_unsafe_env_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """The xdist-aware environment path should use the same database-name allowlist."""
    monkeypatch.setenv("POSTGRES_TEST_DB", "test_r9lab; DROP DATABASE postgres; --")
    monkeypatch.delenv("PYTEST_XDIST_WORKER", raising=False)

    with pytest.raises(ValueError, match="Unsafe test database name"):
        test_config._get_worker_test_db_name()
