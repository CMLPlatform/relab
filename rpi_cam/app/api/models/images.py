"""Pydantic models for Image information."""

from datetime import UTC, datetime
from typing import Annotated

from PIL.ExifTags import Base
from PIL.Image import Exif, Image
from pydantic import (
    AliasGenerator,
    AnyUrl,
    BaseModel,
    ConfigDict,
    Field,
    FutureDatetime,
    PlainSerializer,
    PositiveFloat,
    PositiveInt,
)
from pydantic.alias_generators import to_pascal, to_snake


def serialize_datetime_with_z(dt: datetime) -> str:
    """Serialize datetime to ISO 8601 format with 'Z' timezone."""
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


class ImageProperties(BaseModel):
    """Basic image properties."""

    width: PositiveInt = Field(description="Image width in pixels")
    height: PositiveInt = Field(description="Image height in pixels")
    capture_time: Annotated[datetime, PlainSerializer(serialize_datetime_with_z)] = Field(
        default_factory=lambda: datetime.now(UTC), description="Capture time in UTC"
    )


class CameraProperties(BaseModel):
    """Static camera properties from libcamera.

    For more info, see https://libcamera.org/api-html/namespacelibcamera_1_1properties.html.
    """

    camera_model: str | None = Field(default=None, alias="Model")
    unit_cell_size: tuple[PositiveInt, PositiveInt] | None = Field(
        default=None, description="Sensor unit cell size in nanometers"
    )
    pixel_array_size: tuple[PositiveInt, PositiveInt] | None = Field(default=None)
    sensor_sensitivity: float | None = Field(default=None)

    # Allow the fields to be populated by PascalCase dicts and serialized as snake_case
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=AliasGenerator(validation_alias=to_pascal, serialization_alias=to_snake)
    )


class CaptureMetadata(BaseModel):
    """Dynamic capture metadata from libcamera.

    For more info, see  https://libcamera.org/api-html/namespacelibcamera_1_1controls.html.
    """

    exposure_time: PositiveInt | None = Field(default=None, description="Exposure time in microseconds")
    frame_duration: PositiveInt | None = Field(default=None, description="Frame duration in microseconds")
    color_temperature: PositiveInt | None = Field(default=None, description="Color temperature in K")
    analogue_gain: float | None = Field(default=None)
    digital_gain: float | None = Field(default=None)
    lux: PositiveFloat | None = Field(default=None, description="Illuminance in lux")
    sensor_temperature: float | None = Field(default=None, description="Sensor temperature in °C")

    # Allow the fields to be populated by PascalCase dicts and serialized as snake_case
    model_config = ConfigDict(
        populate_by_name=True, alias_generator=AliasGenerator(validation_alias=to_pascal, serialization_alias=to_snake)
    )


class BaseMetadata(BaseModel):
    """Base metadata model for both images and streams."""

    camera_properties: CameraProperties
    capture_metadata: CaptureMetadata

    model_config = ConfigDict(frozen=True, str_strip_whitespace=True)


class ImageMetadata(BaseMetadata):
    """Complete image metadata model."""

    image_properties: ImageProperties

    @classmethod
    def from_metadata(cls, img: Image, camera_properties: dict, capture_metadata: dict) -> "ImageMetadata":
        return cls(
            image_properties=ImageProperties(width=img.size[0], height=img.size[1]),
            camera_properties=CameraProperties.model_validate(camera_properties),
            capture_metadata=CaptureMetadata.model_validate(capture_metadata),
        )

    def to_exif(self) -> Exif:
        """Convert metadata to PIL Exif object."""
        exif = Exif()

        # Required fields
        exif.update(
            {
                Base.Make.value: "Raspberry Pi",
                Base.Software.value: "picamera2",
                Base.DateTime.value: self.image_properties.capture_time.strftime("%Y:%m:%d %H:%M:%S"),
                Base.ImageWidth.value: self.image_properties.width,
                Base.ImageLength.value: self.image_properties.height,
            }
        )

        # Optional fields
        if self.capture_metadata.exposure_time:
            exif[Base.ExposureTime.value] = self.capture_metadata.exposure_time / 1_000_000
        if self.capture_metadata.color_temperature:
            exif[Base.WhiteBalance.value] = self.capture_metadata.color_temperature
        if self.capture_metadata.sensor_temperature:
            exif[Base.AmbientTemperature.value] = self.capture_metadata.sensor_temperature

        return exif


class ImageCaptureResponse(BaseModel):
    """Response model for image capture."""

    image_id: str = Field(pattern=r"^[0-9a-f]{32}$", description="Unique image identifier")
    metadata: ImageMetadata = Field(description="Image metadata")
    image_url: AnyUrl = Field(description="URL to access image")
    expires_at: Annotated[FutureDatetime, PlainSerializer(serialize_datetime_with_z)] = Field(
        description="Expiration time for image URL"
    )
