"""DTO schemas for users."""

import uuid
from datetime import datetime
from typing import Annotated, Optional

from fastapi_users import schemas
from pydantic import UUID4, ConfigDict, EmailStr, Field, StringConstraints

from app.api.auth.models import OrganizationBase, UserBase
from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp, BaseUpdateSchema, ProductRead

# TODO: Refactor into separate files for each model.
# This is tricky due to circular imports and the way SQLAlchemy and Pydantic handle schema building.


### Organizations ###
class OrganizationCreate(BaseCreateSchema, OrganizationBase):
    """Create schema for organizations."""


class OrganizationReadPublic(BaseReadSchemaWithTimeStamp, OrganizationBase):
    """Read schema for organizations."""


class OrganizationRead(OrganizationBase):
    """Public read schema for organizations."""

    owner_id: UUID4 = Field(description="ID of the organization owner.")


class OrganizationReadWithRelationshipsPublic(BaseReadSchemaWithTimeStamp, OrganizationBase):
    """Read schema for organizations, including relationships."""

    members: list["UserReadPublic"] = Field(default_factory=list, description="List of users in the organization.")


class OrganizationReadWithRelationships(BaseReadSchemaWithTimeStamp, OrganizationBase):
    """Read schema for organizations, including relationships."""

    members: list["UserRead"] = Field(default_factory=list, description="List of users in the organization.")


class OrganizationUpdate(BaseUpdateSchema):
    """Update schema for organizations."""

    name: str = Field(min_length=2, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)

    # TODO: Handle transfer of ownership


### Users ###
class UserCreateBase(UserBase, schemas.BaseUserCreate):
    """Base schema for user creation."""

    # Override for validation
    username: Annotated[str | None, StringConstraints(strip_whitespace=True)] = None

    # Override for OpenAPI schema configuration
    password: str = Field(json_schema_extra={"format": "password"})


class UserCreate(UserCreateBase):
    """Create schema for users, optionally with organization to join."""

    organization_id: UUID4 | None = None

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "email": "user@example.com",
                        "password": "fakepassword",
                        "username": "username",
                        "organization_id": "1fa85f64-5717-4562-b3fc-2c963f66afa6",
                    }
                ]
            }
        }
    )


class UserCreateWithOrganization(UserCreateBase):
    """Create schema for users with organization to create and own."""

    organization: "OrganizationCreate"

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "email": "user@example.com",
                        "password": "fakepassword",
                        "username": "username",
                        "organization": {"name": "organization", "location": "location", "description": "description"},
                    }
                ]
            }
        }
    )


class UserReadPublic(UserBase):
    """Public read schema for users."""

    id: UUID4
    email: EmailStr
    created_at: Optional[datetime] = None
    product_count: int = 0


class UserRead(UserBase, schemas.BaseUser[uuid.UUID]):
    """Read schema for users."""

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "id": "1fa85f64-5717-4562-b3fc-2c963f66afa6",
                        "email": "user@example.com",
                        "is_active": True,
                        "is_superuser": False,
                        "is_verified": True,
                        "username": "username",
                    }
                ]
            }
        }
    )


class UserReadWithOrganization(UserRead):
    """Read schema for users with organization."""

    organization: Optional["OrganizationRead"] = Field(default=None, description="Organization the user belongs to.")


class UserReadWithRelationships(UserReadWithOrganization):
    """Read schema for users, including relationships."""

    products: list[ProductRead] = Field(default_factory=list, description="List of products owned by the user.")


class UserUpdate(UserBase, schemas.BaseUserUpdate):
    """Update schema for users."""

    username: Annotated[str | None, StringConstraints(strip_whitespace=True)] = None
    organization_id: UUID4 | None = None
    is_profile_public: bool | None = None

    # Override password field to include password format in JSON schema
    password: str | None = Field(default=None, json_schema_extra={"format": "password"})

    model_config: ConfigDict = ConfigDict(  # pyright: ignore [reportIncompatibleVariableOverride] # This is not a type override, see https://github.com/fastapi/sqlmodel/discussions/855
        {
            "json_schema_extra": {
                "examples": [
                    {
                        "password": "newpassword",
                        "email": "user@example.com",
                        "is_active": True,
                        "is_superuser": True,
                        "is_verified": True,
                        "username": "username",
                        "organization_id": "1fa85f64-5717-4562-b3fc-2c963f66afa6",
                    }
                ]
            }
        }
    )
