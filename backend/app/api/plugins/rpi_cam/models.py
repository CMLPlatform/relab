"""Database models for the Raspberry Pi Camera plugin."""

import uuid
from enum import StrEnum
from urllib.parse import urljoin

from cachetools import TTLCache
from httpx import AsyncClient, RequestError
from pydantic import UUID4, AnyUrl, BaseModel, SecretStr, computed_field
from relab_rpi_cam_models.camera import CameraStatusView as CameraStatusDetails
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.api.auth.models import User
from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.plugins.rpi_cam.config import settings
from app.api.plugins.rpi_cam.constants import PLUGIN_CAMERA_STATUS_ENDPOINT
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
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    ERROR = "error"

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

    connection: CameraConnectionStatus
    details: CameraStatusDetails | None = None


### Pydantic base schema (shared with schemas/) ###
class CameraBase(BaseModel):
    """Base schema for Camera. Used by Pydantic schemas only, not ORM."""

    name: str
    description: str | None = None
    connection_mode: ConnectionMode = ConnectionMode.HTTP
    url: str | None = None

    model_config = {"use_enum_values": True}


### RpiCam Model ###
class Camera(TimeStampMixinBare, Base):
    """Database model for Camera."""

    __tablename__ = "camera"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)
    connection_mode: Mapped[ConnectionMode] = mapped_column(
        SAEnum(ConnectionMode), nullable=False, server_default=ConnectionMode.HTTP.name
    )
    url: Mapped[str | None] = mapped_column(String, default=None)

    encrypted_api_key: Mapped[str] = mapped_column(nullable=False)
    encrypted_auth_headers: Mapped[str | None] = mapped_column(default=None)

    # Many-to-one relationship with User
    owner_id: Mapped[UUID4] = mapped_column(ForeignKey("user.id"))
    owner: Mapped[User] = relationship(
        primaryjoin="Camera.owner_id == User.id",
        foreign_keys="[Camera.owner_id]",
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
        """Get the current connection status of the camera."""
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

        status_url = urljoin(str(self.url), PLUGIN_CAMERA_STATUS_ENDPOINT)
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
