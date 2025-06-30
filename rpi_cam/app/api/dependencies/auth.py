"""Authorization dependencies for FastAPI."""

from typing import Annotated

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.core.config import settings

# TODO: Improve API key handling
#  - Use hashed keys instead of encryption
#  - Add API key management endpoints in the Raspberry Pi API and the main API
#  - Add API key expiration and automated rotation
#  - Add automated key syncing between main API and Raspberry Pi
#  - Consider just using Oauth2 with JWT tokens

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="API Key from user of the main API.")


async def verify_request(
    x_api_key: Annotated[str | None, Security(api_key_header)] = None,
) -> str:
    """Verify X-API-Key header against authorized key.

    FastAPI automatically converts the HTTP header 'X-API-Key' to the parameter name 'x_api_key'.
    """
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API Key header is missing")
    if x_api_key not in settings.authorized_api_keys:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key
