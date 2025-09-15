"""Database models for the Raspberry Pi Camera plugin."""

import uuid
from enum import Enum
from functools import cached_property
from typing import TYPE_CHECKING
from urllib.parse import urljoin

import httpx
from asyncache import cached
from cachetools import TTLCache
from pydantic import UUID4, BaseModel, HttpUrl, computed_field
from relab_rpi_cam_models.camera import CameraStatusView as CameraStatusDetails
from sqlmodel import AutoString, Field, Relationship

from app.api.common.models.base import CustomBase, TimeStampMixinBare
from app.api.common.models.custom_fields import HttpUrlInDB
from app.api.plugins.rpi_cam.config import settings
from app.api.plugins.rpi_cam.utils.encryption import decrypt_dict, decrypt_str, encrypt_dict

if TYPE_CHECKING:
    from app.api.auth.models import User


### Utility models ###
class CameraConnectionStatus(str, Enum):
    """Camera connection status."""

    ONLINE = "online"
    OFFLINE = "offline"
    UNAUTHORIZED = "unauthorized"  # Camera is online but user is unauthorized
    FORBIDDEN = "forbidden"  # Camera is online but user is forbidden
    ERROR = "error"  # Camera is online but there is another error

    def to_http_error(self) -> tuple[int, str]:
        """Get appropriate HTTP status code and message for non-online status."""
        match self:
            case CameraConnectionStatus.ONLINE:
                return 200, "Camera is online"
            case CameraConnectionStatus.OFFLINE:
                return 503, "Camera is offline"
            case CameraConnectionStatus.UNAUTHORIZED:
                return 401, "Unauthorized access to camera"
            case CameraConnectionStatus.FORBIDDEN:
                return 403, "Forbidden access to camera"
            case CameraConnectionStatus.ERROR:
                return 500, "Camera access error"


class CameraStatus(BaseModel):
    """Camera connection status and details."""

    connection: CameraConnectionStatus = Field(description="Connection status of the camera")

    # TODO: Publish the plugin as a separate package and import the status details schema from there
    details: CameraStatusDetails | None = Field(
        default=None, description="Additional status details from the Raspberry Pi camera API"
    )


### RpiCam Model ###
class CameraBase(CustomBase):
    """Base model for Camera with common fields."""

    name: str = Field(index=True, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=500)

    # NOTE: Local addresses only work when they are on the local network of this API
    # TODO: Add support for server communication to local network cameras for users via websocket or similar

    # NOTE: Database models will have url as string type. This is likely because of how sa_type=Autostring works
    # This means HttpUrl methods are not available in database model instances.
    # TODO: Only validate the URL format in Pydantic schemas and store as plain string in the database model.
    url: HttpUrlInDB = Field(description="HTTP(S) URL where the camera API is hosted", sa_type=AutoString)


class Camera(CameraBase, TimeStampMixinBare, table=True):
    """Database model for Camera."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True)
    encrypted_api_key: str = Field(nullable=False)
    # TODO: Consider merging encrypted_auth_headers and encrypted_api_key into a single encrypted_credentials field
    encrypted_auth_headers: str | None = Field(default=None)

    # Many-to-one relationship with User
    owner_id: UUID4 = Field(foreign_key="user.id")
    owner: "User" = Relationship()  # One-way relationship to maintain plugin isolation

    @computed_field
    @cached_property
    def auth_headers(self) -> dict[str, str]:
        """Get all authentication headers including server-generated x-api-key."""
        headers = {settings.api_key_header_name: decrypt_str(self.encrypted_api_key)}
        if self.encrypted_auth_headers:
            headers.update(self._decrypt_auth_headers())
        return headers

    def _decrypt_auth_headers(self) -> dict[str, str]:
        """Decrypt additional auth headers."""
        return {} if not self.encrypted_auth_headers else decrypt_dict(self.encrypted_auth_headers)

    def set_auth_headers(self, headers: dict[str, str]) -> None:
        """Encrypt and store additional auth headers."""
        self.encrypted_auth_headers = encrypt_dict(headers)

    @computed_field
    @cached_property
    def verify_ssl(self) -> bool:
        """Whether to verify SSL certificates based on URL scheme."""
        return HttpUrl(self.url).scheme == "https"

    def __hash__(self) -> int:
        """Make Camera instances hashable using their id. Used for caching."""
        return hash(self.id)

    async def get_status(self, *, force_refresh: bool = False) -> CameraStatus:
        if force_refresh:
            return await self._fetch_status()

        return await self._get_cached_status()

    @cached(cache=TTLCache(maxsize=1, ttl=15))
    async def _get_cached_status(self) -> CameraStatus:
        """Cached version of status fetch."""
        return await self._fetch_status()

    async def _fetch_status(self) -> CameraStatus:
        status_url = urljoin(str(self.url), "/camera/status")

        async with httpx.AsyncClient(timeout=2.0, verify=self.verify_ssl) as client:
            try:
                response = await client.get(status_url, headers=self.auth_headers)
                match response.status_code:
                    case 200:
                        return CameraStatus(
                            connection=CameraConnectionStatus.ONLINE, details=CameraStatusDetails(**response.json())
                        )
                    case 401:
                        return CameraStatus(connection=CameraConnectionStatus.UNAUTHORIZED, details=None)
                    case 403:
                        return CameraStatus(connection=CameraConnectionStatus.FORBIDDEN, details=None)
            except httpx.RequestError:
                return CameraStatus(connection=CameraConnectionStatus.OFFLINE, details=None)
            else:
                return CameraStatus(connection=CameraConnectionStatus.ERROR, details=None)

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"
