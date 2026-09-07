"""Tests for shared text input validation helpers."""

import pytest
from pydantic import TypeAdapter, ValidationError

from app.api.common.validation import (
    FILTER_CSV_SEPARATOR,
    MAX_QUERY_LIST_ITEMS,
    MAX_QUERY_TEXT_LENGTH,
    BoundedQueryText,
    BoundedQueryTextList,
    normalize_user_text,
)


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


_query_text = TypeAdapter(BoundedQueryText)
_query_list = TypeAdapter(BoundedQueryTextList)


def test_bounded_query_text_trims_and_drops_blanks() -> None:
    """Whitespace-only search input is treated as no filter at all."""
    assert _query_text.validate_python("  drill ") == "drill"
    assert _query_text.validate_python("   ") is None


@pytest.mark.parametrize(
    ("value", "message"),
    [
        ("x" * (MAX_QUERY_TEXT_LENGTH + 1), "at most"),
        (123, "must be a string"),
    ],
)
def test_bounded_query_text_rejects_unbounded_input(value: object, message: str) -> None:
    """Query text is bounded before it reaches the database."""
    with pytest.raises(ValidationError, match=message):
        _query_text.validate_python(value)


def test_bounded_query_text_list_splits_and_trims_csv() -> None:
    """Separator-joined filter values arrive as a trimmed list.

    fastapi-filters hands list-typed filters through as a single-element list,
    so the separator has to be split out of that form too — otherwise a
    two-value filter is queried as one literal string and matches nothing.
    """
    assert _query_list.validate_python(f"steel{FILTER_CSV_SEPARATOR} copper") == ["steel", "copper"]
    assert _query_list.validate_python([f"steel{FILTER_CSV_SEPARATOR}copper"]) == ["steel", "copper"]
    assert _query_list.validate_python([" steel "]) == ["steel"]


def test_bounded_query_text_list_keeps_commas_inside_values() -> None:
    """A comma is legitimate user text (``Johnson, Inc``) and must not split a value."""
    assert _query_list.validate_python(["Johnson, Inc"]) == ["Johnson, Inc"]


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (f"steel{FILTER_CSV_SEPARATOR}{FILTER_CSV_SEPARATOR}copper", "must not be blank"),
        ([f"m{i}" for i in range(MAX_QUERY_LIST_ITEMS + 1)], "at most"),
        (["x" * (MAX_QUERY_TEXT_LENGTH + 1)], "at most"),
    ],
)
def test_bounded_query_text_list_rejects_unbounded_input(value: object, message: str) -> None:
    """List filters are bounded in both item count and item length."""
    with pytest.raises(ValidationError, match=message):
        _query_list.validate_python(value)
