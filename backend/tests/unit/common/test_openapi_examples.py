"""Unit tests for OpenAPI example helpers."""

from __future__ import annotations

from pathlib import Path


def test_api_modules_do_not_inline_large_example_literals() -> None:
    """API modules should keep example payloads centralized instead of inlining large literals."""
    backend_root = Path(__file__).resolve().parents[2]
    api_root = backend_root / "app" / "api"

    forbidden_snippets = (
        "openapi_examples={",
        "examples=[",
        'json_schema_extra={"examples": [',
        'json_schema_extra={"examples": {',
    )

    offenders: list[str] = []
    for path in sorted(api_root.rglob("*.py")):
        if path.name == "examples.py":
            continue
        contents = path.read_text()
        offenders.extend(
            f"{path.relative_to(backend_root)} -> {snippet}"
            for snippet in forbidden_snippets
            if snippet in contents
        )

    assert offenders == []

