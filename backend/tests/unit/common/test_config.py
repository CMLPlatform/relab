"""Unit tests for the common API configuration."""

from app.api.common.config import APISettings


def test_full_docs_adds_admin_tag_group() -> None:
    """Full (internal) docs include an Admin tag group absent from public docs."""
    settings = APISettings()
    public_group_names = {g["name"] for g in settings.public_docs.x_tag_groups}
    full_group_names = {g["name"] for g in settings.full_docs.x_tag_groups}
    assert "Admin" in full_group_names
    assert "Admin" not in public_group_names


def test_full_docs_is_superset_of_public_docs() -> None:
    """All public tag groups are present in full docs."""
    settings = APISettings()
    full_names = {g["name"] for g in settings.full_docs.x_tag_groups}
    for group in settings.public_docs.x_tag_groups:
        assert group["name"] in full_names
