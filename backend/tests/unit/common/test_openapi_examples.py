"""Unit tests for OpenAPI example helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.api.common.openapi_examples import openapi_example, openapi_examples


@pytest.mark.unit
class TestOpenAPIExamples:
    """Tests for shared OpenAPI example helper functions."""

    def test_openapi_example_builds_value_only_payload(self) -> None:
        """A basic example should include the value unchanged."""
        result = openapi_example({"id": 1})

        assert result == {"value": {"id": 1}}

    def test_openapi_example_includes_summary_and_description(self) -> None:
        """Optional metadata should be included when provided."""
        result = openapi_example(
            "camera-token",
            summary="Example token",
            description="Returned by the provisioning email",
        )

        assert result["value"] == "camera-token"
        assert result["summary"] == "Example token"
        assert result["description"] == "Returned by the provisioning email"

    def test_openapi_examples_returns_named_example_mapping(self) -> None:
        """Named examples should be preserved for FastAPI OpenAPI wiring."""
        result = openapi_examples(
            basic=openapi_example([1, 2, 3], summary="Bulk IDs"),
            empty=openapi_example([]),
        )

        assert set(result) == {"basic", "empty"}
        assert result["basic"]["value"] == [1, 2, 3]
        assert result["basic"]["summary"] == "Bulk IDs"
        assert result["empty"]["value"] == []

    def test_api_modules_do_not_inline_large_example_literals(self) -> None:
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
