"""Pydantic models used to validate CRUD operations for the Raspberry Pi Camera plugin."""

from typing import Annotated, Self

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter
from pydantic import (
    UUID4,
    AfterValidator,
    BaseModel,
    Field,
    HttpUrl,
    PlainSerializer,
    SecretStr,
)

from app.api.auth.filters import UserFilter
from app.api.common.schemas.base import (
    BaseCreateSchema,
    BaseReadSchemaWithTimeStamp,
    BaseUpdateSchema,
)
from app.api.plugins.rpi_cam.config import settings
from app.api.plugins.rpi_cam.models import Camera, CameraBase, CameraStatus
from app.api.plugins.rpi_cam.utils.encryption import decrypt_str


### Filters ###
class CameraFilter(Filter):
    """FastAPI-filter class for Camera filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    url__ilike: str | None = None

    search: str | None = None

    class Constants(Filter.Constants):  # Standard FastAPI-filter class
        """FilterAPI class configuration."""

        model = Camera
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
            "url",
        ]


class CameraFilterWithOwner(CameraFilter):
    """FastAPI-filter class for Camera filtering with owner relationship."""

    owner: UserFilter | None = FilterDepends(with_prefix("owner", UserFilter))


### Auth Header Utils ###
MAX_AUTH_HEADERS_SIZE = 3500  # Max cookie size is 4096 bytes, 3500 allows buffer for server-generated headers


def validate_auth_header_key(key: str) -> str:
    """Validate that the header key is not reserved for the server-generated API key."""
    if key.lower() == settings.api_key_header_name.lower():
        err_msg = f"Header key '{key}' is reserved for the server-generated API key."
        raise ValueError(err_msg)
    return key


class HeaderCreate(BaseModel):
    """HTTP header key-value pair with validation."""

    key: Annotated[
        str,
        Field(description="Header key", min_length=1, max_length=100, pattern=r"^[a-zA-Z][-.a-zA-Z0-9]*$"),
        AfterValidator(validate_auth_header_key),
    ]
    # TODO: Consider adding SecretStr for any secret values in all schemas. Requires custom (de-)serialization logic
    value: SecretStr = Field(description="Header value", min_length=1, max_length=500)


def serialize_auth_headers(headers: list[HeaderCreate] | None) -> dict[str, str] | None:
    """Convert list of HeaderCreate objects to a dictionary of headers."""
    if not headers:
        return None
    return {h.key: h.value.get_secret_value() for h in headers}


def validate_auth_headers_size(headers: list[HeaderCreate] | None) -> list[HeaderCreate] | None:
    """Validate size of HeaderCreate list."""
    if (
        headers
        and (header_size := sum(len(h.key) + len(h.value.get_secret_value()) for h in headers)) > MAX_AUTH_HEADERS_SIZE
    ):
        err_msg = f"Total size of headers is {header_size} bytes, exceeding maximum of {MAX_AUTH_HEADERS_SIZE} bytes."
        raise ValueError(err_msg)
    return headers


OptionalAuthHeaderCreateList = Annotated[
    list[HeaderCreate] | None,
    Field(default=None, description="List of additional authentication headers for the camera API"),
    PlainSerializer(serialize_auth_headers),
    AfterValidator(validate_auth_headers_size),
]


### CRUD schemas ###
## Create schemas
class CameraCreate(BaseCreateSchema, CameraBase):
    """Schema for creating a camera."""

    auth_headers: OptionalAuthHeaderCreateList


## Read schemas
class CameraRead(BaseReadSchemaWithTimeStamp, CameraBase):
    """Basic Camera Read schema."""

    owner_id: UUID4

    @classmethod
    def _get_base_fields(cls, db_model: Camera) -> dict:
        return {
            **db_model.model_dump(exclude={"encrypted_api_key", "encrypted_auth_headers", "auth_headers", "status"}),
        }


class CameraReadWithStatus(CameraRead):
    """Schema for camera read with online status."""

    status: CameraStatus

    @classmethod
    async def from_db_model_with_status(cls, db_model: Camera) -> Self:
        return cls(**CameraRead._get_base_fields(db_model), status=await db_model.get_status())


class CameraReadWithCredentials(CameraRead):
    """Schema for camera read with credentials."""

    api_key: str
    auth_headers: dict[str, str] | None

    @classmethod
    def from_db_model_with_credentials(cls, db_model: Camera) -> Self:
        decrypted_headers = db_model._decrypt_auth_headers() if db_model.encrypted_auth_headers else None

        return cls(
            **CameraRead._get_base_fields(db_model),
            api_key=decrypt_str(db_model.encrypted_api_key),
            auth_headers=decrypted_headers,
        )


## Update schemas
class CameraUpdate(BaseUpdateSchema):
    """Schema for updating a camera."""

    name: str | None = Field(default=None, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    url: HttpUrl | None = Field(default=None, description="HTTP(S) URL where the camera API is hosted")
    auth_headers: OptionalAuthHeaderCreateList

    # TODO: Make it only possible to change ownership to existing users within the same organization
    owner_id: UUID4 | None = None
