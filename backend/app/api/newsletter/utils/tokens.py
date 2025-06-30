"""Service for creating and verifying JWT tokens for newsletter confirmation."""

from datetime import UTC, datetime, timedelta
from enum import Enum

import jwt

from app.api.auth.config import settings

ALGORITHM = "HS256"  # Algorithm used for JWT encoding/decoding


class JWTType(str, Enum):
    """Enum for different newsletter-related JWT types."""

    NEWSLETTER_CONFIRMATION = "newsletter_confirmation"
    NEWSLETTER_UNSUBSCRIBE = "newsletter_unsubscribe"

    @property
    def expiration_seconds(self) -> int:
        """Return the expiration time in seconds for the token type."""
        match self:
            case JWTType.NEWSLETTER_CONFIRMATION:
                return settings.verification_token_ttl_seconds
            case JWTType.NEWSLETTER_UNSUBSCRIBE:
                return settings.newsletter_unsubscription_token_ttl_seconds
            case _:
                err_msg = f"Invalid token type: {self}"
                raise ValueError(err_msg)


def create_jwt_token(email: str, token_type: JWTType) -> str:
    """Create a JWT token for newsletter confirmation."""
    expiration = datetime.now(UTC) + timedelta(seconds=token_type.expiration_seconds)
    payload = {"sub": email, "exp": expiration, "type": token_type.value}
    return jwt.encode(payload, settings.newsletter_secret, algorithm=ALGORITHM)


def verify_jwt_token(token: str, expected_token_type: JWTType) -> str | None:
    """Verify the JWT token and return the email if valid."""
    try:
        payload = jwt.decode(token, settings.newsletter_secret, algorithms=[ALGORITHM])
        if payload["type"] != expected_token_type.value:
            return None
        return payload["sub"]  # Returns the email address from the token
    except (jwt.PyJWTError, KeyError):
        return None
