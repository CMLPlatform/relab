"""Unit tests for the dummy_data seed script."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from app.api.common.models.enums import Unit
from scripts.seed import dummy_data as dummy_data_script

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


@pytest.mark.unit
class TestDummyDataScript:
    """Verify the seed script's helper behavior."""

    def test_normalize_unit_accepts_enum_values(self) -> None:
        """Known enum values from the seed data should be accepted directly."""
        assert dummy_data_script.normalize_unit("kg", "Phone") is Unit.KILOGRAM

    def test_normalize_unit_accepts_enum_names(self) -> None:
        """Enum member names should be accepted as a fallback."""
        assert dummy_data_script.normalize_unit("KILOGRAM", "Phone") is Unit.KILOGRAM

    def test_normalize_unit_defaults_and_warns_for_unknown_strings(self, mocker: MockerFixture) -> None:
        """Unknown string values should log a warning and fall back safely."""
        warning_mock = mocker.patch.object(dummy_data_script.logger, "warning")

        normalized = dummy_data_script.normalize_unit("mystery-unit", "Phone")

        assert normalized is Unit.KILOGRAM
        warning_mock.assert_called_once_with(
            "Unknown unit '%s' for %s, defaulting to kilogram.",
            "mystery-unit",
            "Phone",
        )

    def test_normalize_unit_defaults_for_non_strings(self) -> None:
        """Missing or non-string units should default without warning."""
        assert dummy_data_script.normalize_unit(None, "Phone") is Unit.KILOGRAM
