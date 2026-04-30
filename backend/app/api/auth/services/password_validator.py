"""Password validation service.

Extracted from UserManager per ADR-012 to keep auth business logic
in services rather than fastapi-users hooks.
"""
# spell-checker: ignore blocklisted, changeme, letmein, reverseengineeringlab

import hashlib
import logging
import unicodedata

from fastapi_users import InvalidPasswordException
from httpx import AsyncClient, HTTPError
from pydantic import SecretStr

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 12
MIN_CONTEXT_TOKEN_LENGTH = 3
BLOCKLISTED_PASSWORD_TOKENS = frozenset(
    {
        "password",
        "qwerty",
        "admin",
        "letmein",
        "welcome",
        "changeme",
        "relab",
        "reverseengineeringlab",
    }
)


def _normalize_for_validation(value: str) -> str:
    """Normalize user-controlled strings before validation comparisons."""
    return unicodedata.normalize("NFC", value).casefold()


def _password_contains_context(password: str, value: str | None) -> bool:
    """Return whether the normalized password contains a normalized account value."""
    if not value:
        return False
    normalized_value = _normalize_for_validation(value)
    return len(normalized_value) >= MIN_CONTEXT_TOKEN_LENGTH and normalized_value in password


def _password_matches_blocklist(password: str) -> bool:
    """Return whether the normalized password contains a known weak token."""
    compact_password = "".join(char for char in password if char.isalnum())
    return any(blocked in compact_password for blocked in BLOCKLISTED_PASSWORD_TOKENS)


async def check_pwned_password(password: str, http_client: AsyncClient) -> int:
    """Return how many times this password appears in HaveIBeenPwned breach data.

    Uses k-anonymity: only the first 5 hex chars of the SHA-1 hash are sent;
    the plaintext password never leaves this process.
    Fails open (returns 0) if the API is unreachable.
    """
    # Have I Been Pwned's range API requires SHA-1 for its k-anonymity protocol.
    # The digest is used only to derive the range prefix for the outbound lookup,
    # never for password storage or local password verification.
    sha1 = hashlib.sha1(password.encode(), usedforsecurity=False).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        response = await http_client.get(
            f"https://api.pwnedpasswords.com/range/{prefix}",
            headers={"Add-Padding": "true"},
            timeout=5.0,
        )
        response.raise_for_status()
        for line in response.text.splitlines():
            h, _, count = line.partition(":")
            if h == suffix:
                return int(count)
    except HTTPError:
        logger.warning("Have I Been Pwnd breach check unavailable, skipping for this request")
    return 0


async def validate_password(
    password: str | SecretStr,
    *,
    email: str,
    username: str | None = None,
    http_client: AsyncClient | None = None,
    skip_breach_check: bool = False,
) -> None:
    """Validate password meets security requirements.

    Raises:
        InvalidPasswordException: If the password fails any check.
    """
    if isinstance(password, SecretStr):
        password = password.get_secret_value()

    normalized_password = _normalize_for_validation(password)
    normalized_email = _normalize_for_validation(email)
    email_local_part = normalized_email.partition("@")[0]

    if len(password) < MIN_PASSWORD_LENGTH:
        raise InvalidPasswordException(reason=f"Password should be at least {MIN_PASSWORD_LENGTH} characters")
    if normalized_email in normalized_password or _password_contains_context(normalized_password, email_local_part):
        raise InvalidPasswordException(reason="Password should not contain e-mail")
    if _password_contains_context(normalized_password, username):
        raise InvalidPasswordException(reason="Password should not contain username")
    if _password_matches_blocklist(normalized_password):
        raise InvalidPasswordException(
            reason="Password is too common. Please choose a longer, less predictable password."
        )

    if not skip_breach_check and http_client:
        breach_count = await check_pwned_password(password, http_client)
        if breach_count > 0:
            raise InvalidPasswordException(
                reason="Password has appeared in a known data breach. Please choose a different password."
            )
