"""The admin account-erasure route.

Shares `/admin/users` with `auth.routers.admin_users` rather than living beside the
other admin routes: erasing an account reaches into products, media and cameras, so it
belongs in the application layer. The path, tag, and superuser guard are unchanged.
"""

from typing import Annotated

from fastapi import Query, Request, Security

from app.api.application.account_erasure import ANONYMIZE, ErasureContent, erase_user, require_erasable_account
from app.api.auth.dependencies import CurrentActiveSuperUserDep, UserByIDDep, current_active_superuser
from app.api.auth.models import User
from app.api.auth.services.account_security import revoke_user_refresh_tokens
from app.api.common.audiences import AdminAPIRouter
from app.api.common.audit import AuditAction, AuditContext, audit_event
from app.api.common.routers.dependencies import AsyncSessionDep

router = AdminAPIRouter(prefix="/admin/users", tags=["admin"], dependencies=[Security(current_active_superuser)])


@router.delete(
    "/{user_id}",  # user_id is bound by the get_user_or_404 dependency
    summary="Delete a user by ID",
    status_code=204,
)
async def delete_user(
    user: UserByIDDep,
    actor: CurrentActiveSuperUserDep,
    session: AsyncSessionDep,
    request: Request,
    content: Annotated[
        ErasureContent,
        Query(
            description=(
                "What to do with the research data this user contributed: `anonymize` "
                "reassigns their products to the anonymous system account, `delete` "
                "removes the products and their media. Personal data is erased either way."
            )
        ),
    ] = ANONYMIZE,
) -> None:
    """Delete a user by ID, anonymizing or deleting the content they own."""
    # Guard first so a refused erasure has no side effects; revoke before erasing so a
    # Redis failure aborts rather than leaving a deleted user with live sessions.
    await require_erasable_account(session, user)
    await revoke_user_refresh_tokens(user.id, request)
    await erase_user(session, user, actor_id=actor.id, content=content)
    audit_event(actor.id, AuditAction.DELETE, User, user.id, context=AuditContext(operation=f"erase_{content}"))
