"""The over-quota report finds exactly the accounts a role change would lock out."""

import pytest

from app.api.auth.roles import UserRole, upload_quota_files_for_role
from scripts.maintenance.list_accounts_over_contributor_quota import _report
from tests.factories.models import UserFactory

pytestmark = pytest.mark.api


async def test_report_counts_only_accounts_over_their_own_tier(db_session, monkeypatch) -> None:
    """A contributor above the contributor tier is reported; a lab account at the same usage is not."""
    over = await UserFactory.create_async(
        session=db_session,
        role=UserRole.CONTRIBUTOR,
        upload_file_count=upload_quota_files_for_role(UserRole.CONTRIBUTOR) + 1,
        refresh_instance=True,
    )
    await UserFactory.create_async(
        session=db_session,
        role=UserRole.LAB,
        upload_file_count=upload_quota_files_for_role(UserRole.CONTRIBUTOR) + 1,
        refresh_instance=True,
    )
    await db_session.commit()

    # The script opens its own session; point it at the test one.
    monkeypatch.setattr(
        "scripts.maintenance.list_accounts_over_contributor_quota.async_session_context",
        lambda: _NullContext(db_session),
    )
    assert await _report() == 1
    assert over.role == UserRole.CONTRIBUTOR


class _NullContext:
    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *_exc):
        return False
