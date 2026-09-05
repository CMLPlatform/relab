"""OAuth account persistence helpers."""

from typing import TYPE_CHECKING

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import InvalidOAuthProviderError, OAuthAccountNotLinkedError
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.account_security import require_step_up_password
from app.api.auth.services.email.service import send_oauth_link_changed_notification

if TYPE_CHECKING:
    from fastapi_users.password import PasswordHelperProtocol

SUPPORTED_UNLINK_PROVIDERS = frozenset({"google", "github"})


async def remove_oauth_association(
    *,
    provider: str,
    current_user: User,
    session: AsyncSession,
    password_helper: PasswordHelperProtocol,
    current_password: str | None,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Remove a linked OAuth account for the current user.

    Unlinking a social login is a sensitive auth-method change, so an account with a
    usable password must re-enter it (step-up), matching email/password changes. An
    OAuth-only account has no password to verify — the notification email below is the
    compensating control.
    """
    if provider not in SUPPORTED_UNLINK_PROVIDERS:
        raise InvalidOAuthProviderError(provider)

    result = await session.execute(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id,
            OAuthAccount.oauth_name == provider,
        )
    )
    oauth_account = result.scalars().first()
    if not oauth_account:
        raise OAuthAccountNotLinkedError(provider)

    # Step-up re-auth after confirming the link exists. Shared with the link flow so the
    # two cannot drift apart.
    require_step_up_password(
        password_helper=password_helper,
        user=current_user,
        current_password=current_password,
        action="unlink a social login",
    )

    await session.delete(oauth_account)
    await session.commit()

    await send_oauth_link_changed_notification(
        current_user.email,
        current_user.username,
        oauth_provider=provider,
        linked=False,
        background_tasks=background_tasks,
    )
