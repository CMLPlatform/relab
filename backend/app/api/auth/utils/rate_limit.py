"""Rate limiting configuration using SlowAPI for authentication endpoints."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.api.auth.config import settings as auth_settings
from app.core.config import settings as core_settings

# Create limiter instance
# Rate limit is expressed as "max_attempts/window_seconds"
# Example: "5/900second" = 5 attempts per 15 minutes

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],  # No default limits, set per route
    storage_uri=core_settings.cache_url,
    strategy="fixed-window",
    enabled=core_settings.enable_rate_limit,
)

# Rate limit strings for common use cases
LOGIN_RATE_LIMIT = f"{auth_settings.rate_limit_login_attempts}/{auth_settings.rate_limit_window_seconds}second"
REGISTER_RATE_LIMIT = "300/3600second"  # 3 registrations per hour
PASSWORD_RESET_RATE_LIMIT = "3/3600second"  # noqa: S105 # 3 password resets per hour
