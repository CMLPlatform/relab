"""List accounts whose stored uploads exceed the quota their role now grants.

Read-only. Run it around the deploy that introduces roles.

Every account is backfilled to ``contributor``, which is deliberately fail-closed:
if the contributor tier is below the single global quota that preceded it, an
account already above the new limit keeps every file it has but cannot upload
another until a superuser promotes it to ``lab``. Nothing is deleted and no
existing file is affected — only new reservations fail, with a 413.

This prints who that applies to, so promotion can happen before anyone is
surprised by it:

    python -m scripts.maintenance.list_accounts_over_contributor_quota

Promote with ``PUT /v1/admin/users/{user_id}/role`` and a body of
``{"role": "lab"}``.
"""

import asyncio
import logging

from sqlalchemy import select

from app.api.auth.models import User
from app.api.auth.roles import UserRole, upload_quota_bytes_for_role, upload_quota_files_for_role
from app.core.database import async_session_context, close_async_engine
from app.core.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


async def _report() -> int:
    """Log every account over its role's quota; return how many there were."""
    over_quota = 0
    async with async_session_context() as session:
        # unique(): User.oauth_accounts is a joined eager load against a collection,
        # so SQLAlchemy refuses to hand back rows without de-duplicating them first.
        users = (await session.execute(select(User))).unique().scalars().all()
        for user in users:
            role = UserRole(user.role)
            file_limit = upload_quota_files_for_role(role)
            byte_limit = upload_quota_bytes_for_role(role)
            over_files = user.upload_file_count > file_limit
            over_bytes = user.upload_total_bytes > byte_limit
            if not (over_files or over_bytes):
                continue
            over_quota += 1
            # Ids only, never email or username: this is an operational report and
            # personal data has no reason to reach these logs.
            logger.warning(
                "User %s (%s) is over quota: %d/%d files, %d/%d bytes",
                user.id,
                role.value,
                user.upload_file_count,
                file_limit,
                user.upload_total_bytes,
                byte_limit,
            )

    if over_quota:
        logger.warning("%d account(s) cannot upload until promoted to '%s'.", over_quota, UserRole.LAB.value)
    else:
        logger.info("No account exceeds the quota its role grants.")
    return over_quota


async def main() -> None:
    """Run the report and close the engine."""
    try:
        await _report()
    finally:
        await close_async_engine()


if __name__ == "__main__":
    asyncio.run(main())
