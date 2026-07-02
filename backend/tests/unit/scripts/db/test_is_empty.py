"""Unit tests for the db_is_empty CLI contract."""

from typing import TYPE_CHECKING

from scripts.db import is_empty as db_is_empty

if TYPE_CHECKING:
    import pytest


def test_main_returns_zero_when_database_is_empty(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """An empty database should map to a successful exit code."""
    monkeypatch.setattr(db_is_empty, "database_is_empty", lambda **_: True)

    exit_code = db_is_empty.main([])

    assert exit_code == db_is_empty.EXIT_EMPTY
    assert capsys.readouterr().out.strip() == "Database is empty."


def test_main_returns_non_zero_when_database_has_data(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """A non-empty database should map to the expected sentinel exit code."""
    monkeypatch.setattr(db_is_empty, "database_is_empty", lambda **_: False)

    exit_code = db_is_empty.main([])

    assert exit_code == db_is_empty.EXIT_NOT_EMPTY
    assert capsys.readouterr().out.strip() == "Database contains data."


def test_main_quiet_mode_suppresses_output(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    """Quiet mode should rely on exit codes only."""
    monkeypatch.setattr(db_is_empty, "database_is_empty", lambda **_: True)

    exit_code = db_is_empty.main(["--quiet"])

    assert exit_code == db_is_empty.EXIT_EMPTY
    assert capsys.readouterr().out == ""
