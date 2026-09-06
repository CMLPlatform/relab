"""Shared input-validation helpers for API boundary schemas."""

import unicodedata
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator

MAX_QUERY_TEXT_LENGTH = 100
MAX_QUERY_LIST_ITEMS = 50

# Separator for multi-valued query params (``field[in]``, ``order_by``). ASCII Unit
# Separator, not comma: brand names contain commas ("Johnson, Inc"), and
# normalize_user_text rejects U+001F in stored text. The frontend joins with the same.
FILTER_CSV_SEPARATOR = "\x1f"

_MULTILINE_CONTROL_CHARS = frozenset(("\n", "\t"))


def normalize_user_text(value: str, *, allow_multiline: bool = False) -> str:
    """Normalize user-authored text and reject hidden control characters."""
    normalized = unicodedata.normalize("NFC", value)
    for char in normalized:
        codepoint = ord(char)
        if codepoint >= 0x20 and not (0x7F <= codepoint <= 0x9F):
            continue
        if allow_multiline and char in _MULTILINE_CONTROL_CHARS:
            continue
        msg = "Text must not contain control characters."
        raise ValueError(msg)
    return normalized


def _normalize_multiline_user_text(value: str) -> str:
    """Normalize a multiline user-authored text field."""
    return normalize_user_text(value, allow_multiline=True)


SingleLineUserText = Annotated[str, AfterValidator(normalize_user_text)]
MultilineUserText = Annotated[str, AfterValidator(_normalize_multiline_user_text)]


def normalize_bounded_query_text(value: object) -> str | None:
    """Trim optional search/filter strings and treat blank values as absent."""
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > MAX_QUERY_TEXT_LENGTH:
            msg = f"Query text must be at most {MAX_QUERY_TEXT_LENGTH} characters."
            raise ValueError(msg)
        return stripped
    msg = "Query text must be a string."
    raise ValueError(msg)


def _normalize_bounded_query_text_list(value: object) -> object:
    """Trim list filter values before query construction."""
    if value is None:
        return None
    # fastapi-filters passes list-typed filters as a single-element list; split the
    # separator here or "Dell<US>Apple" is queried as one literal brand.
    if isinstance(value, str):
        items = [item.strip() for item in value.split(FILTER_CSV_SEPARATOR)]
    elif isinstance(value, list):
        items = [
            part.strip()
            for item in value
            for part in (item.split(FILTER_CSV_SEPARATOR) if isinstance(item, str) else [item])
        ]
    else:
        return value

    if any(item == "" for item in items):
        msg = "List filter values must not be blank."
        raise ValueError(msg)
    if len(items) > MAX_QUERY_LIST_ITEMS:
        msg = f"List filters may include at most {MAX_QUERY_LIST_ITEMS} values."
        raise ValueError(msg)
    for item in items:
        if isinstance(item, str) and len(item) > MAX_QUERY_TEXT_LENGTH:
            msg = f"List filter values must be at most {MAX_QUERY_TEXT_LENGTH} characters."
            raise ValueError(msg)
    return items or None


BoundedQueryText = Annotated[
    str | None,
    BeforeValidator(normalize_bounded_query_text),
]
BoundedQueryTextList = Annotated[
    list[str] | None,
    BeforeValidator(_normalize_bounded_query_text_list),
]
