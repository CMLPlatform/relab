"""Tests for Alembic migration correctness."""

import importlib.util
import logging
import re
import threading
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from alembic import command
from psycopg.errors import InsufficientPrivilege
from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.schema import CreateIndex

from app.api.common.models.base import Base
from app.core.model_registry import load_models

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
        "role",
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
def test_product_role_invariants_check_requires_positive_amount(migration_helper: MigrationHelper) -> None:
    """A component's amount_in_parent must be present and strictly positive."""
    constraints = migration_helper.get_table_constraints("product")
    check = next(c for c in constraints["checks"] if c["name"] == "product_role_invariants")
    assert "amount_in_parent > 0" in check["sqltext"]


@pytest.mark.migration
def test_materialproductlink_quantity_check(migration_helper: MigrationHelper) -> None:
    """Material quantities linked to a product must be strictly positive."""
    constraints = migration_helper.get_table_constraints("materialproductlink")
    check_names = {constraint["name"] for constraint in constraints["checks"]}
    assert "ck_materialproductlink_quantity_positive" in check_names


@pytest.mark.migration
def test_materialproductlink_redundant_material_id_index_dropped(migration_helper: MigrationHelper) -> None:
    """The PK's leading column already covers material_id; the extra index is dropped."""
    with migration_helper.sync_engine.connect() as connection:
        indexes = inspect(connection).get_indexes("materialproductlink")
    index_names = {index["name"] for index in indexes}
    assert "ix_materialproductlink_material_id" not in index_names


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
def test_migrations_downgrade_upgrade(relab_alembic_config: Config, migration_helper: MigrationHelper) -> None:
    """Downgrading one step then upgrading must round-trip back to head.

    Asserts by revision rather than a specific column so it stays valid as new
    migrations are added on top of the previous head.
    """
    head = migration_helper.current_revision()

    command.downgrade(relab_alembic_config, "-1")
    assert migration_helper.current_revision() != head, "downgrade did not move off head"

    command.upgrade(relab_alembic_config, "+1")
    assert migration_helper.current_revision() == head, "upgrade did not restore head"


@pytest.mark.migration
def test_pending_thumbnail_index_is_a_revision_of_its_own(
    relab_alembic_config: Config, migration_helper: MigrationHelper
) -> None:
    """The concurrent index must not share a revision with the column it indexes.

    ``autocommit_block()`` commits whatever the revision did before it, so a column added
    in the same ``upgrade()`` is committed while the revision is still unstamped: a build
    that loses its race for the lock then leaves the column applied and the revision not
    recorded, and every later upgrade dies re-adding a column that already exists.
    Stepping down one revision at a time is what pins the split (the index goes, the
    column stays), and the round trip back to head covers both revisions.
    """

    def index_is_valid() -> bool | None:
        rows = migration_helper.execute_sql(
            "SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass('ix_image_thumbnails_pending')"
        )
        return rows[0][0] if rows else None

    # An INVALID index is never used by the planner, so the backfill would sequential-scan
    # `image` on every deploy while every write still maintained the dead index.
    assert index_is_valid() is True

    try:
        command.downgrade(relab_alembic_config, "b3f1c07d5e94")
        assert index_is_valid() is None, "the index revision must own the index, and nothing else"
        assert migration_helper.column_exists("image", "thumbnails_generated_at")

        command.downgrade(relab_alembic_config, "4a672549f270")
        assert not migration_helper.column_exists("image", "thumbnails_generated_at")
    finally:
        command.upgrade(relab_alembic_config, "head")

    assert migration_helper.column_exists("image", "thumbnails_generated_at")
    assert index_is_valid() is True


@pytest.mark.migration
def test_pending_thumbnail_index_survives_a_lost_revision_stamp(
    relab_alembic_config: Config, migration_helper: MigrationHelper
) -> None:
    """A built index with the revision unstamped must re-run, not fail forever.

    ``CREATE INDEX CONCURRENTLY`` commits inside ``autocommit_block()``, before the
    revision is stamped. A process that dies in that window leaves the index VALID and
    the revision unrecorded, which took the API down on two hosts: the migrator failed
    with ``relation ... already exists`` on every re-run, and the services gated on it
    never started. ``stamp`` reproduces exactly that state -- the index is left alone,
    only the version moves.

    The INVALID case must keep raising, so this asserts adoption only for a valid index.
    """

    def index_is_valid() -> bool | None:
        rows = migration_helper.execute_sql(
            "SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass('ix_image_thumbnails_pending')"
        )
        return rows[0][0] if rows else None

    assert index_is_valid() is True, "precondition: head builds a valid index"

    command.stamp(relab_alembic_config, "b3f1c07d5e94")
    assert migration_helper.current_revision() == "b3f1c07d5e94"

    command.upgrade(relab_alembic_config, "head")

    assert migration_helper.current_revision() == "e2a7c4d1b930", (
        "the revision must stamp over an index it had already built"
    )
    assert index_is_valid() is True, "the adopted index must be left intact"


@pytest.mark.migration
def test_downgrade_lands_on_the_lengths_the_previous_revision_declares(
    relab_alembic_config: Config, migration_helper: MigrationHelper
) -> None:
    """A downgrade must restore column *types*, not just drop what it added.

    The round-trip test above compares head to head, so it passes even when downgrade()
    widens a column it should have restored. That leaves the database on a schema a fresh
    build never produces, and the next upgrade then fails on data written in between.
    """
    # Named explicitly, not "-1": this pins one revision's downgrade, and a revision
    # added on top would otherwise silently retarget the assertion.
    try:
        command.downgrade(relab_alembic_config, "a9c2e4f60b18")
        lengths = migration_helper.text_column_lengths()
        # a9c2e4f60b18 declares these; 4a672549f270 narrows/widens them on the way up.
        assert lengths[("video", "title")] == 100
        assert lengths[("user", "username")] is None
    finally:
        command.upgrade(relab_alembic_config, "head")

    assert migration_helper.text_column_lengths()[("video", "title")] == 200


@pytest.mark.migration
def test_alembic_autogenerate_is_clean(relab_alembic_config: Config) -> None:
    """Alembic autogenerate should detect no pending schema changes after head.

    This is the test-suite equivalent of `alembic check`: if ORM metadata has
    drifted from the migration history, this assertion fails.
    """
    command.check(relab_alembic_config)


@pytest.mark.migration
def test_partial_index_predicates_match_the_models(migration_helper: MigrationHelper) -> None:
    """Every partial index's predicate must match the one the models declare.

    ``alembic check`` compares an index's columns but not its ``postgresql_where``,
    so editing a predicate without writing a migration passes the autogenerate test
    while production keeps indexing a different subset of rows. Postgres normalizes
    a predicate when it stores it, so the model's version is compared after the same
    round trip rather than as a string.
    """
    load_models()
    partial_indexes = [
        index
        for table in Base.metadata.tables.values()
        for index in table.indexes
        if index.dialect_options["postgresql"].get("where") is not None
    ]
    assert partial_indexes, "found no partial indexes; this test is discovering nothing"

    probes = {}
    for index in partial_indexes:
        ddl = str(CreateIndex(index).compile(dialect=postgresql.dialect())).strip()
        probes[index.name] = f"{index.name}_predicate_probe"
        migration_helper.execute_sql(ddl.replace(index.name, probes[index.name], 1))

    try:
        predicates = dict(
            migration_helper.execute_sql(
                "SELECT c.relname, pg_get_expr(i.indpred, i.indrelid) "
                "FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid "
                "WHERE i.indpred IS NOT NULL"
            )
        )
    finally:
        for probe in probes.values():
            migration_helper.execute_sql(f"DROP INDEX {probe}")

    for name, probe in probes.items():
        assert predicates[name] == predicates[probe], (
            f"{name} predicate drifted: database has {predicates[name]}, models declare {predicates[probe]}"
        )


@pytest.mark.migration
def test_high_churn_tables_declare_autovacuum_reloptions(migration_helper: MigrationHelper) -> None:
    """The models own the reloptions the database has, so a flatten cannot lose them."""
    load_models()
    rows = dict(
        migration_helper.execute_sql(
            "SELECT relname, reloptions::text FROM pg_class WHERE relname IN ('product', 'image', 'file')"
        )
    )
    for table in ("product", "image", "file"):
        declared = Base.metadata.tables[table].dialect_options["postgresql"]["with"]
        assert declared, f"{table} declares no reloptions"
        for key, value in declared.items():
            assert f"{key}={value}" in (rows[table] or ""), (table, key, rows[table])


@pytest.mark.migration
def test_text_length_and_extension_placement(migration_helper: MigrationHelper) -> None:
    """Revision 4a672549f270 moved pg_trgm, renamed the legacy constraint, and bounded two columns."""
    schemas = dict(
        migration_helper.execute_sql(
            "SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace"
        )
    )
    assert schemas["pg_trgm"] == "extensions"

    constraints = {
        name
        for (name,) in migration_helper.execute_sql(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'user'::regclass"
        )
    }
    assert "user_profile_stats_not_null" in constraints
    assert "user_stats_cache_not_null" not in constraints

    lengths = dict(
        migration_helper.execute_sql(
            "SELECT table_name || '.' || column_name, character_maximum_length "
            "FROM information_schema.columns "
            "WHERE (table_name, column_name) IN (('video', 'title'), ('user', 'username'))"
        )
    )
    assert lengths["video.title"] == 200
    assert lengths["user.username"] == 50


@pytest.mark.migration
def test_trigram_indexes_are_search_only_and_schema_qualified(migration_helper: MigrationHelper) -> None:
    """The seven search trigram indexes moved schema; the four admin-list ones are gone."""
    definitions = dict(
        migration_helper.execute_sql("SELECT indexname, indexdef FROM pg_indexes WHERE indexname LIKE '%_trgm_idx'")
    )
    expected = {
        "category_name_trgm_idx",
        "material_name_trgm_idx",
        "producttype_name_trgm_idx",
        "producttype_description_trgm_idx",
        "product_name_trgm_idx",
        "product_brand_trgm_idx",
        "product_model_trgm_idx",
    }
    assert set(definitions) == expected
    for name, definition in definitions.items():
        assert "extensions.gin_trgm_ops" in definition, (name, definition)


@pytest.mark.migration
def test_dropping_pg_trgm_unowned_raises_what_the_revision_translates(migration_helper: MigrationHelper) -> None:
    """A non-owner's DROP EXTENSION must raise the error `_move_pg_trgm` turns into advice.

    The revision no longer predicts ownership from `pg_has_role`, which passes on mere
    role membership and let a migrator reach a DDL Postgres then refused. It attempts the
    drop and translates the refusal, so what this pins is the refusal's shape: if psycopg
    ever stopped raising InsufficientPrivilege here, the revision would re-raise a bare
    ProgrammingError instead of naming the superuser statement an operator has to run.

    The suite runs as the superuser, which owns everything; a throwaway role stands in for
    a migrator on a host provisioned before that role existed.
    """
    versions = Path(__file__).resolve().parents[3] / "alembic" / "versions"
    spec = importlib.util.spec_from_file_location(
        "revision_4a672549f270", versions / "4a672549f270_tighten_text_lengths_and_move_pg_trgm.py"
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    migration_helper.execute_sql("CREATE ROLE trgm_probe")
    try:
        with migration_helper.sync_engine.connect() as connection:
            assert module.pg_trgm_schema(connection) == "extensions"
            connection.execute(text("SET ROLE trgm_probe"))
            try:
                # The refused statement changes nothing, so the extension outlives the
                # probe even on this autocommit connection.
                with pytest.raises(ProgrammingError) as excinfo:
                    connection.execute(text("DROP EXTENSION pg_trgm"))
                assert isinstance(excinfo.value.orig, InsufficientPrivilege)
            finally:
                connection.execute(text("RESET ROLE"))  # the autocommit engine pools this connection
            assert module.pg_trgm_schema(connection) == "extensions"
    finally:
        migration_helper.execute_sql("DROP ROLE trgm_probe")

    # The instruction names the schema the move is heading for, not a hardcoded one:
    # the downgrade direction moves pg_trgm back to `public`.
    assert "ALTER EXTENSION pg_trgm SET SCHEMA extensions" in module.SUPERUSER_INSTRUCTION.format(schema="extensions")
    assert "ALTER EXTENSION pg_trgm SET SCHEMA public" in module.SUPERUSER_INSTRUCTION.format(schema="public")


# Longer than the 5s `lock_timeout` env.py sets once it holds the lock: a migrator that
# aborts instead of queueing gives up at 5s, so a shorter wait here would not tell the
# two apart.
_LOCK_WAIT_SECONDS = 8


@pytest.mark.migration
def test_a_second_migrator_queues_behind_the_advisory_lock(
    relab_alembic_config: Config, migration_helper: MigrationHelper
) -> None:
    """A migrator started while another holds the lock must wait, not fail.

    ``lock_timeout`` applies to ``pg_advisory_lock`` as well as to table locks, so
    setting it before taking the lock made a queued deploy an aborted one: a container
    started while a migration was already running died instead of running after it.

    Nothing else in the suite runs two migrators at once, so without this the lock could
    be removed and every other migration test would still pass.
    """
    # Read out of env.py rather than repeated here: a drift would make this take a
    # different lock, finish immediately, and pass silently.
    env_source = (Path(__file__).resolve().parents[3] / "alembic" / "env.py").read_text()
    match = re.search(r"^_MIGRATION_LOCK_ID = ([\d_]+)$", env_source, re.MULTILINE)
    assert match is not None, "env.py no longer defines _MIGRATION_LOCK_ID"
    lock_id = int(match.group(1).replace("_", ""))

    finished = threading.Event()
    failures: list[BaseException] = []

    def upgrade() -> None:
        try:
            # The database is already at head, so this applies no revision; what it
            # exercises is env.py's connection setup, which takes the lock first.
            command.upgrade(relab_alembic_config, "head")
        except Exception as exc:  # noqa: BLE001 # reported on the main thread
            failures.append(exc)
        finally:
            finished.set()

    with migration_helper.sync_engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": lock_id})
        queued = threading.Thread(target=upgrade, name="queued-migrator", daemon=True)
        queued.start()
        try:
            assert not finished.wait(_LOCK_WAIT_SECONDS), "the queued migrator did not wait for the lock"
        finally:
            holder.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": lock_id})

    assert finished.wait(60), "the queued migrator did not run once the lock was released"
    queued.join(timeout=60)
    assert not failures, failures
    assert migration_helper.current_revision() is not None
