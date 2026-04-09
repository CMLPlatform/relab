"""Password validation service.

Extracted from UserManager per ADR-012 to keep auth business logic
in services rather than fastapi-users hooks.
"""

import hashlib
import logging

import zxcvbn as zxcvbn_checker
from fastapi_users import InvalidPasswordException
from httpx import AsyncClient, HTTPError
from pydantic import SecretStr

logger = logging.getLogger(__name__)

# zxcvbn score threshold: 0=very weak, 1=weak, 2=fair, 3=good, 4=strong
MIN_PASSWORD_STRENGTH_SCORE = 1


async def check_pwned_password(password: str, http_client: AsyncClient) -> int:
    """Return how many times this password appears in HaveIBeenPwned breach data.

    Uses k-anonymity: only the first 5 hex chars of the SHA-1 hash are sent;
    the plaintext password never leaves this process.
    Fails open (returns 0) if the API is unreachable.
    """
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

    if len(password) < 8:
        raise InvalidPasswordException(reason="Password should be at least 8 characters")
    if email in password:
        raise InvalidPasswordException(reason="Password should not contain e-mail")
    if username and username in password:
        raise InvalidPasswordException(reason="Password should not contain username")

    # Strength check: reject passwords that are too guessable
    user_inputs = [s for s in [email, username] if s]
    result = zxcvbn_checker.zxcvbn(password, user_inputs=user_inputs)
    if result["score"] < MIN_PASSWORD_STRENGTH_SCORE:
        feedback = result.get("feedback", {}).get("warning") or "try a longer phrase or mix of characters"
        raise InvalidPasswordException(reason=f"Password is too weak: {feedback}")

    if not skip_breach_check and http_client:
        breach_count = await check_pwned_password(password, http_client)
        if breach_count > 0:
            raise InvalidPasswordException(
                reason="Password has appeared in a known data breach. Please choose a different password."
            )
