"""Unit tests for the conditional JSON response helper."""

import json
from typing import TYPE_CHECKING
from unittest.mock import MagicMock

from fastapi_pagination import Page
from pydantic import BaseModel
from starlette.requests import Request

from app.core import responses

if TYPE_CHECKING:
    import pytest


class _Row(BaseModel):
    id: int
    name: str


def _request(if_none_match: str | None = None) -> Request:
    headers = [] if if_none_match is None else [(b"if-none-match", if_none_match.encode())]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def _page() -> Page[_Row]:
    return Page[_Row](items=[_Row(id=i, name=f"row {i}") for i in range(3)], total=3, page=1, size=50, pages=1)


def test_model_payload_is_serialized_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """A pydantic payload skips the generic encoder and keeps a stable ETag and 304 support."""
    spy = MagicMock(wraps=responses.jsonable_encoder)
    monkeypatch.setattr(responses, "jsonable_encoder", spy)

    first = responses.conditional_json_response(_request(), _page())
    second = responses.conditional_json_response(_request(), _page())

    assert spy.call_count == 0
    assert first.status_code == 200
    assert first.media_type == "application/json"
    assert json.loads(bytes(first.body))["items"][0] == {"id": 0, "name": "row 0"}
    assert first.headers["etag"] == second.headers["etag"]

    not_modified = responses.conditional_json_response(_request(first.headers["etag"]), _page())
    assert not_modified.status_code == 304


def test_plain_payload_keeps_generic_encoding() -> None:
    """Dict payloads still go through the generic encoder with a key-order independent ETag."""
    first = responses.conditional_json_response(_request(), {"b": 1, "a": 2})
    second = responses.conditional_json_response(_request(), {"a": 2, "b": 1})

    assert json.loads(bytes(first.body)) == {"a": 2, "b": 1}
    assert first.headers["etag"] == second.headers["etag"]
