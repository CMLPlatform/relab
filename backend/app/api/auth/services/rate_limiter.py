"""Auth-owned rate-limit bucket sizes.

The limiter itself is generic and lives in ``app.api.common.rate_limiting``;
only the auth flow budgets are configured here.
"""

from app.api.auth.config import settings as auth_settings

LOGIN_RATE_LIMIT = f"{auth_settings.rate_limit_login_attempts_per_minute}/minute"
REGISTER_RATE_LIMIT = f"{auth_settings.rate_limit_register_attempts_per_hour}/hour"
VERIFY_RATE_LIMIT = f"{auth_settings.rate_limit_verify_attempts_per_hour}/hour"
PASSWORD_RESET_RATE_LIMIT = f"{auth_settings.rate_limit_password_reset_attempts_per_hour}/hour"
