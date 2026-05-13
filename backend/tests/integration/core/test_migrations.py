"""Tests for Alembic migration correctness."""

import logging
from typing import TYPE_CHECKING

import pytest
from alembic import command

if TYPE_CHECKING:
    from alembic.config import Config

    from tests.fixtures.migrations import MigrationHelper

logger = logging.getLogger(__name__)

# All tables expected to exist after upgrade head.
# Table names are the lowercase class names defined on each model.
EXPECTED_TABLES = {
    # Auth
    "user",
    "oauthaccount",
    # Reference data
    "taxonomy",
    "category",
    "material",
    "producttype",
    "categorymateriallink",
    "categoryproducttypelink",
    # Data collection
    "product",
    "materialproductlink",
    # File storage
    "file",
    "image",
    "video",
}


@pytest.mark.migration
def test_all_expected_tables_exist(migration_helper: MigrationHelper) -> None:
    """Every domain table must be present after upgrade head.

    This catches migrations that were written but never applied, or table
    renames that were not reflected in a new migration.
    """
    for table in EXPECTED_TABLES:
        assert migration_helper.table_exists(table), f"Expected table '{table}' not found in schema"


@pytest.mark.migration
def test_user_table_has_required_columns(migration_helper: MigrationHelper) -> None:
    """Core user columns must be present; guards against accidental column drops."""
    columns = set(migration_helper.get_table_columns("user"))
    required = {
        "id",
        "email",
        "email_canonical",
        "hashed_password",
        "is_active",
        "is_superuser",
        "created_at",
        "updated_at",
        "profile_stats",
        "profile_stats_computed_at",
        "upload_file_count",
        "upload_total_bytes",
    }
    missing = required - columns
    assert not missing, f"user table is missing columns: {missing}"
    assert "last_login_ip" not in columns


@pytest.mark.migration
def test_user_table_has_upload_quota_constraints(migration_helper: MigrationHelper) -> None:
    """Upload quota ledger counters must not be allowed to go negative."""
    constraints = migration_helper.get_table_constraints("user")
    check_names = {constraint["name"] for constraint in constraints["checks"]}
    assert "ck_user_upload_file_count_non_negative" in check_names
    assert "ck_user_upload_total_bytes_non_negative" in check_names


@pytest.mark.migration
def test_media_tables_have_upload_size_constraints(migration_helper: MigrationHelper) -> None:
    """Persisted upload sizes must not be allowed to go negative."""
    file_constraints = migration_helper.get_table_constraints("file")
    image_constraints = migration_helper.get_table_constraints("image")
    file_check_names = {constraint["name"] for constraint in file_constraints["checks"]}
    image_check_names = {constraint["name"] for constraint in image_constraints["checks"]}
    assert "ck_file_upload_size_bytes_non_negative" in file_check_names
    assert "ck_image_upload_size_bytes_non_negative" in image_check_names


@pytest.mark.migration
def test_oauthaccount_foreign_key_to_user(migration_helper: MigrationHelper) -> None:
    """Oauthaccount must have a FK back to the user table."""
    constraints = migration_helper.get_table_constraints("oauthaccount")
    fk_tables = {fk["referred_table"] for fk in constraints["fk"]}
    assert "user" in fk_tables, "oauthaccount is missing its FK to the user table"


@pytest.mark.migration
def test_category_foreign_key_to_taxonomy(migration_helper: MigrationHelper) -> None:
    """Category must have a FK back to the taxonomy table."""
    constraints = migration_helper.get_table_constraints("category")
    fk_tables = {fk["referred_table"] for fk in constraints["fk"]}
    assert "taxonomy" in fk_tables, "category is missing its FK to the taxonomy table"


@pytest.mark.migration
def test_alembic_version_at_head(migration_helper: MigrationHelper) -> None:
    """alembic_version table must exist and hold a revision (i.e. head was reached)."""
    revision = migration_helper.current_revision()
    assert revision is not None, "No revision recorded; migrations may not have run"


@pytest.mark.migration
def test_migrations_downgrade_upgrade(relab_alembic_config: Config) -> None:
    """Migration downgrade/upgrade cycle must succeed without error."""
    command.downgrade(relab_alembic_config, "-1")
    command.upgrade(relab_alembic_config, "+1")


@pytest.mark.migration
def test_alembic_autogenerate_is_clean(relab_alembic_config: Config) -> None:
    """Alembic autogenerate should detect no pending schema changes after head.

    This is the test-suite equivalent of `alembic check`: if ORM metadata has
    drifted from the migration history, this assertion fails.
    """
    command.check(relab_alembic_config)
