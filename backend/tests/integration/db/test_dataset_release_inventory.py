"""Integration coverage for the dataset-release inventory query.

The unit tests build record dicts by hand, so they cannot catch a mismatch between the
shape `collect_inventory` reads out of the database and the shape `select_records` expects
of it. That mismatch is exactly what shipped once: the owner column was popped off each row
to use as a grouping key, and the selection rules then looked for it and found nothing. Only
running the query against a real database finds this class of bug, so it is tested here
rather than with fixtures.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from app.api.auth.terms import CURRENT_TERMS_VERSION
from scripts.build_dataset_release import SelectionRules, collect_inventory
from tests.factories.models import ProductFactory, UserFactory

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_inventory_reads_rows_the_selection_rules_can_use(db_session: AsyncSession) -> None:
    """A contributor who accepted the terms is counted as consenting and in scope."""
    user = await UserFactory.create_async(db_session, username="consenting-contributor")
    user.terms_accepted_version = CURRENT_TERMS_VERSION
    await db_session.flush()
    await ProductFactory.create_async(db_session, owner_id=user.id, name="Cordless drill", product_type_id=None)

    rows = await collect_inventory(db_session, SelectionRules())

    row = next(row for row in rows if row["username"] == "consenting-contributor")
    assert row["consenting"] == "yes"
    assert int(row["in_scope"]) == 1
    assert int(row["excluded"]) == 0


@pytest.mark.asyncio
async def test_inventory_excludes_a_contributor_who_never_accepted(db_session: AsyncSession) -> None:
    """No acceptance means no licence grant, so the records are out of scope but still counted."""
    # Stated rather than inherited: never accepting is this test's whole premise, so it
    # should not rest on UserFactory's default staying None.
    user = await UserFactory.create_async(db_session, username="silent-contributor", terms_accepted_version=None)
    await ProductFactory.create_async(db_session, owner_id=user.id, name="Angle grinder", product_type_id=None)

    rows = await collect_inventory(db_session, SelectionRules())

    row = next(row for row in rows if row["username"] == "silent-contributor")
    assert row["consenting"] == "no"
    assert int(row["in_scope"]) == 0
    # Counted, not hidden: the paper's statistics need records the release cannot carry.
    assert int(row["excluded"]) == 1
    assert int(row["records"]) == 1
