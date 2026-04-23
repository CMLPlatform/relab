"""Unit tests for the common API configuration."""

from app.__version__ import version
from app.api.common.config import APISettings


class TestAPISettingsOpenAPIDocs:
    """APISettings should expose correctly structured OpenAPI metadata."""

    def test_public_docs_title(self) -> None:
        """Public docs use the expected human-readable API title."""
        settings = APISettings()
        assert "Reverse Engineering Lab" in settings.public_docs.title

    def test_public_docs_version_matches_package(self) -> None:
        """Docs version is kept in sync with the installed package version."""
        settings = APISettings()
        assert settings.public_docs.version == version

    def test_public_docs_license_is_agpl(self) -> None:
        """Public docs reference the AGPL-3.0 license."""
        settings = APISettings()
        assert "Affero" in settings.public_docs.license_info["name"]
        assert settings.public_docs.license_info["url"].startswith("https://")

    def test_public_docs_tag_groups_are_non_empty(self) -> None:
        """Public docs define at least one tag group."""
        settings = APISettings()
        assert len(settings.public_docs.x_tag_groups) > 0

    def test_full_docs_adds_admin_tag_group(self) -> None:
        """Full (internal) docs include an Admin tag group absent from public docs."""
        settings = APISettings()
        public_group_names = {g["name"] for g in settings.public_docs.x_tag_groups}
        full_group_names = {g["name"] for g in settings.full_docs.x_tag_groups}
        assert "Admin" in full_group_names
        assert "Admin" not in public_group_names

    def test_full_docs_is_superset_of_public_docs(self) -> None:
        """All public tag groups are present in full docs."""
        settings = APISettings()
        full_names = {g["name"] for g in settings.full_docs.x_tag_groups}
        for group in settings.public_docs.x_tag_groups:
            assert group["name"] in full_names
