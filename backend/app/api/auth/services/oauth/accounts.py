"""OAuth account persistence helpers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.exceptions import InvalidOAuthProviderError, OAuthAccountNotLinkedError
from app.api.auth.models import OAuthAccount, User

SUPPORTED_UNLINK_PROVIDERS = frozenset({"google", "github"})


async def remove_oauth_association(*, provider: str, current_user: User, session: AsyncSession) -> None:
    """Remove a linked OAuth account for the current user."""
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

    await session.delete(oauth_account)
    await session.commit()
