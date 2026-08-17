"""Unit tests for the generated data-model diagrams and dataset codebook."""

import pytest
import sqlalchemy as sa

from scripts.build_dataset_release import RELEASE_TABLES, field_description
from scripts.generate.export_datamodel import (
    MODULES,
    PARTIALS_DIR,
    Module,
    _expected_partials,
    _module_tables,
    _polymorphic_relations,
    _render_codebook,
    partials_are_current,
)


def _partial(slug: str) -> str:
    return _expected_partials()[PARTIALS_DIR / f"{slug}.generated.mdx"]


def test_committed_partials_match_the_models() -> None:
    """The drift gate `just check` runs. A failure here means `just datamodel` is owed."""
    assert partials_are_current()


def test_every_mapped_table_lands_in_exactly_one_module() -> None:
    """A new bounded context has to be added to MODULES rather than vanishing."""
    grouped = _module_tables()
    tables = [table.name for tables in grouped.values() for table in tables]
    assert sorted(tables) == sorted(set(tables))
    assert set(grouped) == set(MODULES)


def test_diagrams_carry_columns_no_one_documented_by_hand() -> None:
    """The point of generating: the columns a hand-written diagram had drifted past."""
    user_management = _partial("user-management")
    for column in ("mfa_enabled", "terms_accepted_version", "upload_total_bytes", "profile_stats"):
        assert column in user_management

    assert "recording_session" in _partial("camera-plugin").lower()
    assert "search_vector" in _partial("data-collection")


def test_nullable_foreign_keys_render_as_optional_parents() -> None:
    """A nullable FK is a zero-or-one parent; a required one is exactly one."""
    data_collection = _partial("data-collection")
    assert 'PRODUCTTYPE |o--o{ PRODUCT : "product type"' in data_collection
    assert 'USER ||--o{ PRODUCT : "owner"' in data_collection


def test_polymorphic_media_parents_come_from_the_parent_type_enum() -> None:
    """File and image parents have no FK, so the enum members are the only source."""
    file_storage = _partial("file-storage")
    for parent in ("PRODUCT", "PRODUCTTYPE", "MATERIAL"):
        assert f'{parent} ||--o{{ IMAGE : "media parent"' in file_storage


def test_a_parent_type_member_naming_no_table_is_an_error() -> None:
    """Renaming a table without its enum member must fail loudly, not drop the edge."""
    metadata = sa.MetaData()
    table = sa.Table(
        "image",
        metadata,
        sa.Column("parent_type", sa.Enum("PRODUCT", "GHOST", name="imageparenttype")),
    )

    with pytest.raises(RuntimeError, match="GHOST"):
        list(_polymorphic_relations(table, {"product"}))


def test_every_released_column_has_a_description() -> None:
    """The codebook is only worth publishing if no column is blank in it."""
    missing = [
        f"{table.path}.{field.name}"
        for table in RELEASE_TABLES
        for field in table.schema
        if not field_description(field)
    ]
    assert missing == []


def test_codebook_marks_nullable_columns_as_optional() -> None:
    """`Required` is what tells a consumer that an absent value means "not recorded"."""
    codebook = _render_codebook()
    assert "| `name` | text | yes |" in codebook
    assert "| `weight_g` | float | no |" in codebook


def test_module_titles_are_unique() -> None:
    """Titles become accTitle text, so a duplicate would make two diagrams indistinguishable."""
    titles = [module.title for module in MODULES]
    assert len(titles) == len(set(titles))
    assert all(isinstance(module, Module) for module in MODULES)
