"""Unit tests for the dummy_data seed script."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.models.enums import Unit
from app.core.env import BACKEND_DIR
from scripts.seed import dummy_data as dummy_data_script
from scripts.seed.dummy_seed import images as seed_images_script

if TYPE_CHECKING:
    from pytest_mock import MockerFixture


class TestDummyDataScript:
    """Verify the seed script's helper behavior."""

    def test_seed_images_read_from_seed_data_directory(self) -> None:
        """Dummy image fixtures should not live under public static files."""
        assert seed_images_script.SEED_IMAGE_DIR == BACKEND_DIR / "data" / "seed" / "images"

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
