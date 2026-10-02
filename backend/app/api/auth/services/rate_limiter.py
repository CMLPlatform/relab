"""Auth-owned rate-limit budgets.

The limiter itself is generic and lives in ``app.api.common.rate_limiting``. Auth owns the
auth flow budgets, and the per-user API limits too, because only auth can tell which user
a request belongs to.
"""

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.access_token_store import request_access_token_owner_id
from app.api.common.rate_limiting import limiter, rate_limit_bucket_key
from app.core.config.core import settings as core_settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
    from uuid import UUID

LOGIN_RATE_LIMIT = f"{auth_settings.rate_limit_login_attempts_per_minute}/minute"
LOGIN_IP_RATE_LIMIT = f"{auth_settings.rate_limit_login_attempts_per_ip_per_minute}/minute"
REGISTER_RATE_LIMIT = f"{auth_settings.rate_limit_register_attempts_per_hour}/hour"
VERIFY_RATE_LIMIT = f"{auth_settings.rate_limit_verify_attempts_per_hour}/hour"
PASSWORD_RESET_RATE_LIMIT = f"{auth_settings.rate_limit_password_reset_attempts_per_hour}/hour"

# API route limits: anonymous requests per client IP, signed-in requests per user.
API_READ_RATE_LIMIT_DEPENDENCY = limiter.dependency(
    core_settings.api_read_rate_limit,
    name="api_read_rate_limit",
    per_user=(core_settings.api_read_rate_limit_per_user, request_access_token_owner_id),
)
API_WRITE_RATE_LIMIT_DEPENDENCY = limiter.dependency(
    core_settings.api_write_rate_limit,
    name="api_write_rate_limit",
    per_user=(core_settings.api_write_rate_limit_per_user, request_access_token_owner_id),
)
API_UPLOAD_RATE_LIMIT_DEPENDENCY = limiter.dependency(
    core_settings.api_upload_rate_limit,
    name="api_upload_rate_limit",
    per_user=(core_settings.api_upload_rate_limit_per_user, request_access_token_owner_id),
)
API_EXPORT_RATE_LIMIT_DEPENDENCY = limiter.dependency(
    core_settings.api_export_rate_limit,
    name="api_export_rate_limit",
    per_user=(core_settings.api_export_rate_limit_per_user, request_access_token_owner_id),
    signed_in_ip_ceiling=core_settings.api_export_rate_limit_signed_in_per_ip,
)


@asynccontextmanager
async def account_guess_budget(user_id: UUID) -> AsyncIterator[None]:
    """Charge a password, TOTP or recovery-code check to the account's guess budget.

    One per-account bucket, sized like the failed-login budget, covers the MFA login
    challenge and every signed-in re-authentication (account deletion, email and password
    changes, social login link and unlink, MFA changes). Guesses spread over routes, IP
    addresses or fresh login challenges still run out.

    Every attempt is charged up front, right or wrong: check-then-charge-on-failure lets
    parallel guesses all pass the check before any of them is charged. Wrap only the
    credential check, and reject a request that lacks the credential before entering
    (``account_security.require_step_up_fields``), so requests that verify nothing do not
    spend the budget.
    """
    await limiter.ahit_key(LOGIN_RATE_LIMIT, rate_limit_bucket_key("auth:guesses:account", str(user_id)))
    yield
