"""Pydantic models used to validate CRUD operations for the Raspberry Pi Camera plugin."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Self

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter
from pydantic import UUID4, ConfigDict, Field, field_validator
from relab_rpi_cam_models import DevicePublicKeyJWK
from relab_rpi_cam_models.telemetry import TelemetrySnapshot

from app.api.auth.filters import UserFilter
from app.api.common.schemas.base import BaseCreateSchema, BaseUpdateSchema, UUIDIdReadSchemaWithTimeStamp
from app.api.plugins.rpi_cam.examples import CAMERA_CREATE_EXAMPLES, CAMERA_READ_EXAMPLES, CAMERA_UPDATE_EXAMPLES
from app.api.plugins.rpi_cam.models import Camera, CameraBase, CameraCredentialStatus, CameraStatus
from app.api.plugins.rpi_cam.service_runtime import get_cached_telemetry, get_camera_status

if TYPE_CHECKING:
    from redis.asyncio import Redis


class CameraFilter(Filter):
    """FastAPI-filter class for Camera filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    search: str | None = None
    order_by: list[str] | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Camera
        search_model_fields: list[str] = ["name", "description"]  # noqa: RUF012


class CameraFilterWithOwner(CameraFilter):
    """FastAPI-filter class for Camera filtering with owner relationship."""

    owner: UserFilter | None = FilterDepends(with_prefix("owner", UserFilter))


class RelayPublicKeyJWK(DevicePublicKeyJWK):
    """Public P-256 JWK registered by an RPi camera."""


class CameraCreate(BaseCreateSchema, CameraBase):
    """Schema for creating a WebSocket-relayed camera."""

    model_config = ConfigDict(json_schema_extra={"examples": CAMERA_CREATE_EXAMPLES})

    relay_public_key_jwk: RelayPublicKeyJWK
    relay_key_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9._~-]+$")

    @field_validator("relay_public_key_jwk")
    @classmethod
    def ensure_public_key_only(cls, value: RelayPublicKeyJWK) -> RelayPublicKeyJWK:
        """Reject private JWK material if a client accidentally sends it."""
        if hasattr(value, "d"):
            msg = "relay_public_key_jwk must not contain private key material."
            raise ValueError(msg)
        return value


class CameraRead(UUIDIdReadSchemaWithTimeStamp, CameraBase):
    """Basic Camera Read schema."""

    model_config = ConfigDict(json_schema_extra={"examples": CAMERA_READ_EXAMPLES})

    owner_id: UUID4
    relay_key_id: str
    relay_credential_status: CameraCredentialStatus


class CameraReadWithStatus(CameraRead):
    """Schema for camera read with online status."""

    status: CameraStatus
    telemetry: TelemetrySnapshot | None = None
    last_image_url: str | None = None
    last_image_thumbnail_url: str | None = None

    @classmethod
    async def from_db_model_with_status(
        cls,
        db_model: Camera,
        redis: Redis | None,
        *,
        include_telemetry: bool = False,
        last_image_url: str | None = None,
        last_image_thumbnail_url: str | None = None,
    ) -> Self:
        """Create CameraReadWithStatus instance from Camera database model, fetching online status."""
        telemetry = await get_cached_telemetry(redis, db_model.id) if include_telemetry else None
        return cls(
            **db_model.model_dump(exclude={"status", "relay_public_key_jwk"}),
            status=await get_camera_status(redis, db_model.id),
            telemetry=telemetry,
            last_image_url=last_image_url,
            last_image_thumbnail_url=last_image_thumbnail_url,
        )


class CameraUpdate(BaseUpdateSchema):
    """Schema for updating a camera."""

    model_config = ConfigDict(json_schema_extra={"examples": CAMERA_UPDATE_EXAMPLES})

    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    owner_id: UUID4 | None = Field(
        default=None,
        description="Transfer ownership to an existing user in the same organization as the current owner.",
    )
    relay_public_key_jwk: RelayPublicKeyJWK | None = None
    relay_key_id: str | None = Field(default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9._~-]+$")
    relay_credential_status: CameraCredentialStatus | None = None

    def credential_updates(self) -> dict[str, Any]:
        """Return credential fields included in this partial update."""
        return self.model_dump(
            include={"relay_public_key_jwk", "relay_key_id", "relay_credential_status"}, exclude_unset=True
        )
