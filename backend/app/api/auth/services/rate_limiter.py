"""Auth-owned rate-limit budgets.

The limiter itself is generic and lives in ``app.api.common.rate_limiting``. Auth owns the
auth flow budgets, and the per-user API limits too, because only auth can tell which user
a request belongs to.
"""

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.access_token_store import request_access_token_owner_id
from app.api.common.rate_limiting import limiter
from app.core.config.core import settings as core_settings

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
