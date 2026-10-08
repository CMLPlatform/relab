"""OAuth account persistence helpers."""

import logging
from typing import TYPE_CHECKING

from fastapi import BackgroundTasks
from httpx_oauth.exceptions import HTTPXOAuthError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import InvalidOAuthProviderError, OAuthAccountNotLinkedError
from app.api.auth.models import OAuthAccount, User
from app.api.auth.services.email.service import send_oauth_link_changed_notification
from app.api.auth.services.mfa_flow import require_step_up
from app.api.auth.services.oauth.clients import google_oauth_client

if TYPE_CHECKING:
    from collections.abc import Iterable

    from app.api.auth.services.user_manager import UserManager
    from app.core.redis import Redis

logger = logging.getLogger(__name__)

SUPPORTED_UNLINK_PROVIDERS = frozenset({"google", "github"})


def google_tokens_to_revoke(accounts: Iterable[OAuthAccount]) -> list[str]:
    """Return one token per Google link, to revoke once the links are deleted.

    The refresh token where one is stored, since revoking it ends the whole grant
    (YouTube scope included); the access token otherwise. GitHub links are skipped: its
    grant revocation is a separate authenticated API, not a standard revocation endpoint.

    Read the tokens before deleting the rows, then pass them to ``revoke_google_tokens``
    after the commit, so no transaction stays open across the provider call.
    """
    return [
        account.refresh_token or account.access_token
        for account in accounts
        if account.oauth_name == google_oauth_client.name
    ]


async def revoke_google_tokens(tokens: Iterable[str]) -> None:
    """Revoke Google grants on a best-effort basis; a failure is logged and never raised."""
    for token in tokens:
        try:
            await google_oauth_client.revoke_token(token)
        except HTTPXOAuthError:
            # The token itself never goes in the log line.
            logger.warning("Google token revocation failed; the account link is removed regardless.")


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
    await require_step_up(
        current_user,
        user_manager=user_manager,
        redis=redis,
        current_password=current_password,
        mfa_code=mfa_code,
        action="unlink a social login",
    )

    tokens_to_revoke = google_tokens_to_revoke([oauth_account])
    await session.delete(oauth_account)
    await session.commit()
    await revoke_google_tokens(tokens_to_revoke)

    await send_oauth_link_changed_notification(
        current_user.email,
        current_user.username,
        oauth_provider=provider,
        linked=False,
        background_tasks=background_tasks,
    )
