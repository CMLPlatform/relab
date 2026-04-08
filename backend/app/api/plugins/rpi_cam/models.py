"""Database models for the Raspberry Pi Camera plugin."""

import uuid
from enum import StrEnum
from urllib.parse import urljoin

from cachetools import TTLCache
from httpx import AsyncClient, RequestError
from pydantic import UUID4, AnyUrl, BaseModel, ConfigDict, SecretStr, computed_field
from relab_rpi_cam_models.camera import CameraStatusView as CameraStatusDetails
from sqlalchemy import Enum as SAEnum
from sqlmodel import AutoString, Column, Field, Relationship, SQLModel

from app.api.auth.models import User
from app.api.common.models.base import TimeStampMixinBare
from app.api.plugins.rpi_cam.config import settings
from app.api.plugins.rpi_cam.utils.encryption import decrypt_dict, decrypt_str, encrypt_dict
from app.api.plugins.rpi_cam.websocket.connection_manager import get_connection_manager
from app.core.cache import async_ttl_cache


class ConnectionMode(StrEnum):
    """How the backend communicates with the RPi camera."""

    HTTP = "http"
    """Backend makes outbound HTTP requests to the camera's public/tunnelled URL (legacy)."""
    WEBSOCKET = "websocket"
    """Camera connects to the backend via an outbound WebSocket tunnel (recommended)."""


### Utility models ###
class CameraConnectionStatus(StrEnum):
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

    details: CameraStatusDetails | None = Field(
        default=None, description="Additional status details from the Raspberry Pi camera API"
    )


### RpiCam Model ###
class CameraBase(SQLModel):
    """Base model for Camera with common fields."""

    name: str = Field(index=True, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    connection_mode: ConnectionMode = Field(
        default=ConnectionMode.HTTP,
        description="How the backend communicates with this camera.",
        sa_column=Column(SAEnum(ConnectionMode), nullable=False, server_default=ConnectionMode.HTTP.name),
    )

    # NOTE: Camera URLs are validated in the Pydantic create/update schemas.
    # The database stores the URL as a plain string so the API can make normal
    # HTTP requests to locally hosted camera APIs or tunnel endpoints.
    # Nullable: WebSocket-mode cameras do not need a public URL.
    url: str | None = Field(
        default=None,
        description="HTTP(S) URL where the camera API is hosted (required for HTTP mode).",
        sa_type=AutoString,
        nullable=True,
    )

    model_config: ConfigDict = ConfigDict(use_enum_values=True)


class Camera(CameraBase, TimeStampMixinBare, table=True):
    """Database model for Camera."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)

    encrypted_api_key: str = Field(nullable=False)
    encrypted_auth_headers: str | None = Field(default=None)

    # Many-to-one relationship with User
    owner_id: UUID4 = Field(foreign_key="user.id")
    owner: User = Relationship(  # One-way relationship to maintain plugin isolation
        sa_relationship_kwargs={
            "primaryjoin": "Camera.owner_id == User.id",
            "foreign_keys": "[Camera.owner_id]",
        }
    )

    @computed_field
    @property
    def auth_headers(self) -> dict[str, SecretStr]:
        """Get all authentication headers including server-generated x-api-key."""
        headers = {settings.api_key_header_name: SecretStr(decrypt_str(self.encrypted_api_key))}
        if self.encrypted_auth_headers:
            decrypted = self._decrypt_auth_headers()
            headers.update({k: SecretStr(v) for k, v in decrypted.items()})
        return headers

    def _decrypt_auth_headers(self) -> dict[str, str]:
        """Decrypt additional auth headers."""
        return {} if not self.encrypted_auth_headers else decrypt_dict(self.encrypted_auth_headers)

    def set_auth_headers(self, headers: dict[str, str]) -> None:
        """Encrypt and store additional auth headers."""
        self.encrypted_auth_headers = encrypt_dict(headers)

    @computed_field
    @property
    def verify_ssl(self) -> bool:
        """Whether to verify SSL certificates based on URL scheme."""
        if not self.url:
            return True
        return AnyUrl(self.url).scheme in {"https", "wss"}

    def __hash__(self) -> int:
        """Make Camera instances hashable using their id. Used for caching."""
        return hash(self.id)

    async def get_status(self, http_client: AsyncClient, *, force_refresh: bool = False) -> CameraStatus:
        """Get the current connection status of the camera, using cache if not force_refresh.

        Status is cached for 15 seconds to avoid excessive requests to the camera API.
        """
        if force_refresh:
            return await self._fetch_status(http_client)

        return await self._get_cached_status(http_client)

    @async_ttl_cache(TTLCache(maxsize=1, ttl=15))
    async def _get_cached_status(self, http_client: AsyncClient) -> CameraStatus:
        """Cached version of status fetch."""
        return await self._fetch_status(http_client)

    async def _fetch_status(self, http_client: AsyncClient) -> CameraStatus:
        if self.connection_mode == ConnectionMode.WEBSOCKET:
            return self._fetch_websocket_status()
        return await self._fetch_http_status(http_client)

    def _fetch_websocket_status(self) -> CameraStatus:
        try:
            manager = get_connection_manager()
        except RuntimeError:
            return CameraStatus(connection=CameraConnectionStatus.OFFLINE, details=None)
        conn = CameraConnectionStatus.ONLINE if manager.is_connected(self.id) else CameraConnectionStatus.OFFLINE
        return CameraStatus(connection=conn, details=None)

    async def _fetch_http_status(self, http_client: AsyncClient) -> CameraStatus:
        if not self.url:
            return CameraStatus(connection=CameraConnectionStatus.OFFLINE, details=None)

        status_url = urljoin(str(self.url), "/camera/status")
        try:
            headers = {k: v.get_secret_value() for k, v in self.auth_headers.items()}
            response = await http_client.get(status_url, headers=headers, timeout=2.0)
            match response.status_code:
                case 200:
                    return CameraStatus(
                        connection=CameraConnectionStatus.ONLINE, details=CameraStatusDetails(**response.json())
                    )
                case 401:
                    return CameraStatus(connection=CameraConnectionStatus.UNAUTHORIZED, details=None)
                case 403:
                    return CameraStatus(connection=CameraConnectionStatus.FORBIDDEN, details=None)
        except RequestError:
            return CameraStatus(connection=CameraConnectionStatus.OFFLINE, details=None)
        else:
            return CameraStatus(connection=CameraConnectionStatus.ERROR, details=None)

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"
