"""Tests for shared text input validation helpers."""

from __future__ import annotations

import pytest

from app.api.common.validation import normalize_user_text


def test_normalize_user_text_uses_unicode_nfc() -> None:
    """Equivalent decomposed Unicode input is normalized before storage."""
    assert normalize_user_text("Cafe\u0301") == "Café"


def test_normalize_user_text_accepts_free_form_unicode_and_punctuation() -> None:
    """Legitimate user-authored text should not be restricted to ASCII."""
    value = "O'Brian uses 铜 and aluminium."

    assert normalize_user_text(value) == value


def test_normalize_user_text_rejects_hidden_control_characters() -> None:
    """Invisible control bytes should not enter user-authored fields."""
    with pytest.raises(ValueError, match="control characters"):
        normalize_user_text("Cordless\u0000drill")


def test_normalize_user_text_allows_tabs_and_newlines_when_requested() -> None:
    """Multiline text fields may keep tabs and newlines."""
    assert normalize_user_text("line 1\n\tline 2", allow_multiline=True) == "line 1\n\tline 2"


def test_normalize_user_text_rejects_newlines_by_default() -> None:
    """Single-line fields reject line breaks."""
    with pytest.raises(ValueError, match="control characters"):
        normalize_user_text("Bosch\nIXO")
