"""Database models for the Raspberry Pi Camera plugin."""
# spell-checker: ignore ondelete

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import UUID4, BaseModel
from relab_rpi_cam_models.camera import CameraStatusView as CameraStatusDetails
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.api.common.models.base import Base, TimeStampMixinBare
from app.api.common.validation import MultilineUserText, SingleLineUserText
from app.core.crypto.sqlalchemy import EncryptedString

if TYPE_CHECKING:
    from app.api.auth.models import User


class CameraCredentialStatus(StrEnum):
    """Status of the camera's relay device credential."""

    ACTIVE = "active"
    REVOKED = "revoked"


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
                result = (200, "Camera is online")
            case CameraConnectionStatus.OFFLINE:
                result = (503, "Camera is offline")
            case CameraConnectionStatus.UNAUTHORIZED:
                result = (401, "Unauthorized access to camera")
            case CameraConnectionStatus.FORBIDDEN:
                result = (403, "Forbidden access to camera")
            case CameraConnectionStatus.ERROR:
                result = (500, "Camera access error")
        return result


class CameraStatus(BaseModel):
    """Camera connection status and details."""

    connection: CameraConnectionStatus
    last_seen_at: datetime | None = None
    details: CameraStatusDetails | None = None


class CameraBase(BaseModel):
    """Base schema for Camera. Used by Pydantic schemas only, not ORM."""

    name: SingleLineUserText
    description: MultilineUserText | None = None


class Camera(TimeStampMixinBare, Base):
    """Database model for a WebSocket-relayed Raspberry Pi camera."""

    __tablename__ = "camera"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(String(500), default=None)

    relay_public_key_jwk: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    relay_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    relay_credential_status: Mapped[CameraCredentialStatus] = mapped_column(
        SAEnum(CameraCredentialStatus),
        nullable=False,
        default=CameraCredentialStatus.ACTIVE,
        server_default=CameraCredentialStatus.ACTIVE.name,
    )

    owner_id: Mapped[UUID4] = mapped_column(ForeignKey("user.id"))
    owner: Mapped[User] = relationship(
        primaryjoin="Camera.owner_id == User.id",
        foreign_keys="[Camera.owner_id]",
    )

    @property
    def credential_is_active(self) -> bool:
        """Return whether this camera can authenticate to the relay."""
        return self.relay_credential_status == CameraCredentialStatus.ACTIVE

    def __str__(self) -> str:
        return f"{self.name} (id: {self.id})"


class RecordingSession(TimeStampMixinBare, Base):
    """Durable backstop for an in-progress YouTube recording."""

    __tablename__ = "recording_session"

    camera_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("camera.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    stream_url: Mapped[str] = mapped_column(String, nullable=False)
    broadcast_key: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    video_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)

    camera: Mapped[Camera] = relationship(
        primaryjoin="RecordingSession.camera_id == Camera.id",
        foreign_keys="[RecordingSession.camera_id]",
    )
