"""Tests for the rollback data-loss classifier."""

import pytest

from scripts.maintenance.downgrade_safety import destructive_upgrade_calls, main

SHAPE_ONLY = """
def upgrade():
    op.add_column("product", sa.Column("width_px", sa.Integer()))
    op.create_index("ix", "product", ["width_px"])
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

def downgrade():
    op.drop_column("product", "width_px")
"""

DROPS_COLUMN = """
def upgrade():
    op.drop_column("product", "dismantling_notes")

def downgrade():
    op.add_column("product", sa.Column("dismantling_notes", sa.Text()))
"""

REWRITES_ROWS = """
def upgrade():
    op.execute("update \\"user\\" set email = lower(email)")
"""

VIA_HELPER = """
def _purge():
    op.execute("DELETE FROM recording_session")

def upgrade():
    _purge()
"""

DYNAMIC_SQL = """
def upgrade():
    for table in ("product", "component"):
        op.execute(f"ALTER TABLE {table} DROP COLUMN notes")
"""

DECLARED_SAFE = """
ROLLBACK_SAFE = True

def upgrade():
    op.drop_table("newslettersubscriber")
"""


def test_shape_only_migration_is_reversible() -> None:
    """Adding objects loses nothing on the way back."""
    assert destructive_upgrade_calls(SHAPE_ONLY) == []


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (DROPS_COLUMN, ["drop_column(product, dismantling_notes)"]),
        (REWRITES_ROWS, ["execute(UPDATE ...)"]),
        (VIA_HELPER, ["execute(DELETE ...)"]),
        (DYNAMIC_SQL, ["execute(<dynamic SQL>)"]),
    ],
)
def test_data_destroying_upgrade_is_reported(source: str, expected: list[str]) -> None:
    """Drops and row rewrites in upgrade() are named."""
    assert destructive_upgrade_calls(source) == expected


def test_rollback_safe_marker_overrides() -> None:
    """A migration can declare its drop harmless."""
    assert destructive_upgrade_calls(DECLARED_SAFE) == []


def test_downgrade_in_downgrade_function_is_not_counted() -> None:
    """Only upgrade() is inspected."""
    # Only upgrade() matters: downgrade() dropping what upgrade() added is the point.
    assert destructive_upgrade_calls(SHAPE_ONLY) == []


def test_unknown_target_revision_is_a_usage_error(capsys: pytest.CaptureFixture[str]) -> None:
    """An unknown revision is exit 2, not a crash."""
    assert main(["not-a-revision"]) == 2
    assert "cannot resolve downgrade range" in capsys.readouterr().err


def test_real_history_to_base_is_reversible(capsys: pytest.CaptureFixture[str]) -> None:
    """The flattened history is one ROLLBACK_SAFE revision, so base is reachable."""
    # Also proves the script reads the real alembic directory.
    assert main(["base"]) == 0
    assert "reverts 1 revision(s) with no data loss" in capsys.readouterr().out
