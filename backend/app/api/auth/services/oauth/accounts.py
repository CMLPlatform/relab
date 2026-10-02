"""OAuth account persistence helpers."""

from typing import TYPE_CHECKING

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import InvalidOAuthProviderError, OAuthAccountNotLinkedError
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.account_security import require_recent_sign_in, require_step_up_password
from app.api.auth.services.email.service import send_oauth_link_changed_notification
from app.api.auth.services.mfa_flow import require_mfa_step_up
from app.api.auth.services.rate_limiter import account_guess_budget

if TYPE_CHECKING:
    from app.api.auth.services.user_manager import UserManager
    from app.core.redis import Redis

SUPPORTED_UNLINK_PROVIDERS = frozenset({"google", "github"})


async def remove_oauth_association(
    *,
    provider: str,
    current_user: User,
    session: AsyncSession,
    user_manager: UserManager,
    redis: Redis,
    current_password: str | None,
    mfa_code: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Remove a linked OAuth account for the current user.

    Unlinking a social login is a sensitive auth-method change, so an account with a
    usable password must re-enter it (step-up), matching email/password changes. An
    OAuth-only account has no password to verify, so it needs a recent sign-in instead;
    the notification email below backs that up. An account with MFA also enters a code.
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
    async with account_guess_budget(current_user.id):
        require_step_up_password(
            password_helper=user_manager.password_helper,
            user=current_user,
            current_password=current_password,
            action="unlink a social login",
        )
        await require_mfa_step_up(
            mfa_code, user=current_user, redis=redis, action="unlink a social login", user_manager=user_manager
        )
    require_recent_sign_in(current_user)

    await session.delete(oauth_account)
    await session.commit()

    await send_oauth_link_changed_notification(
        current_user.email,
        current_user.username,
        oauth_provider=provider,
        linked=False,
        background_tasks=background_tasks,
    )
