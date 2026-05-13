"""Persistence helpers for TOTP enrollment state."""

from datetime import UTC, datetime

from app.api.auth.models import User
from app.api.auth.services.user_manager import UserManager


async def enable_totp(user_manager: UserManager, user: User, secret: str) -> User:
    """Persist a confirmed TOTP enrollment."""
    user.mfa_totp_secret = secret
    user.mfa_enabled = True
    user.mfa_confirmed_at = datetime.now(UTC)
    user_manager.user_db.session.add(user)
    await user_manager.user_db.session.commit()
    await user_manager.user_db.session.refresh(user)
    return user


async def clear_totp(user_manager: UserManager, user: User) -> None:
    """Clear a user's TOTP enrollment."""
    user.mfa_totp_secret = None
    user.mfa_enabled = False
    user.mfa_confirmed_at = None
    user_manager.user_db.session.add(user)
    await user_manager.user_db.session.commit()
