"""Unit tests for shared schema base helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from app.api.common.schemas.base import IntIdReadSchemaWithTimeStamp


class ExampleReadSchema(IntIdReadSchemaWithTimeStamp):
    """Concrete test schema using the shared read base."""

    name: str


class TestBaseReadSchemaWithTimeStamp:
    """Tests for common read-schema behavior."""

    def test_model_validate_reads_attributes_from_objects(self) -> None:
        """Read schemas should accept attribute-based ORM-like inputs by default."""

        class ExampleORMRow:
            id = 1
            name = "example"
            created_at = datetime(2026, 3, 30, 10, 11, 12, tzinfo=UTC)
            updated_at = datetime(2026, 3, 30, 10, 12, 13, tzinfo=UTC)

        result = ExampleReadSchema.model_validate(ExampleORMRow())

        assert result.id == 1
        assert result.name == "example"

    def test_model_dump_serializes_timestamps_with_z_suffix(self) -> None:
        """Timestamp serializer should emit stable UTC ``Z`` strings."""
        result = ExampleReadSchema(
            id=1,
            name="example",
            created_at=datetime(2026, 3, 30, 10, 11, 12, tzinfo=UTC),
            updated_at=datetime(2026, 3, 30, 10, 12, 13, tzinfo=UTC),
        )

        dumped = result.model_dump()

        assert dumped["created_at"] == "2026-03-30T10:11:12Z"
        assert dumped["updated_at"] == "2026-03-30T10:12:13Z"
