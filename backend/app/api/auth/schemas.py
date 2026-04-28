"""DTO schemas for users."""

from __future__ import annotations

import uuid
from datetime import datetime  # noqa: TC003 # Used at runtime for Pydantic model annotations
from typing import Annotated

from fastapi_users import schemas as fastapi_users_schemas
from pydantic import (
    UUID4,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
)

from app.api.auth.examples import (
    ORGANIZATION_CREATE_EXAMPLES,
    REFRESH_TOKEN_REQUEST_EXAMPLES,
    REFRESH_TOKEN_RESPONSE_EXAMPLES,
    USER_CREATE_EXAMPLES,
    USER_CREATE_WITH_ORGANIZATION_EXAMPLES,
    USER_READ_EXAMPLES,
    USER_UPDATE_EXAMPLES,
)
from app.api.auth.models import OrganizationBase, UserBase
from app.api.auth.preferences import UserPreferences, UserPreferencesUpdate
from app.api.auth.profile_stats import ProfileStatsData
from app.api.common.schemas.base import BaseCreateSchema, BaseUpdateSchema, UUIDIdReadSchemaWithTimeStamp

# Note: These auth schemas stay together to avoid circular imports during model/schema construction.


### Organizations ###
class OrganizationCreate(BaseCreateSchema, OrganizationBase):
    """Create schema for organizations."""

    model_config = ConfigDict(json_schema_extra={"examples": ORGANIZATION_CREATE_EXAMPLES})


class OrganizationReadPublic(UUIDIdReadSchemaWithTimeStamp, OrganizationBase):
    """Read schema for organizations."""


class OrganizationRead(OrganizationBase):
    """Public read schema for organizations."""

    owner_id: UUID4 = Field(description="ID of the organization owner.")


class OrganizationReadWithRelationshipsPublic(UUIDIdReadSchemaWithTimeStamp, OrganizationBase):
    """Read schema for organizations, including relationships."""

    members: list[UserReadPublic] = Field(default_factory=list, description="List of users in the organization.")


class OrganizationReadWithRelationships(UUIDIdReadSchemaWithTimeStamp, OrganizationBase):
    """Read schema for organizations, including relationships."""

    members: list[UserRead] = Field(default_factory=list, description="List of users in the organization.")


class OrganizationUpdate(BaseUpdateSchema):
    """Update schema for organizations."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    owner_id: UUID4 | None = Field(
        default=None,
        description="ID of the member who should become the new owner.",
    )


### Users ###

# Validation constraints for username field
ValidatedUsername = Annotated[
    str | None, StringConstraints(strip_whitespace=True, pattern=r"^\w+$", min_length=2, max_length=50)
]

RESERVED_USERNAMES = {
    "me",
    "self",
    "admin",
    "api",
    "root",
    "profile",
    "profiles",
    "newsletter",
    "users",
    "settings",
    "health",
    "docs",
    "redoc",
    "openapi.json",
}


def validate_username_not_reserved(v: str | None) -> str | None:
    """Validate that the username is not on the reserved list."""
    if v and v.lower() in RESERVED_USERNAMES:
        err_msg = f"'{v}' is a reserved username."
        raise ValueError(err_msg)
    return v


class UserCreateBase(UserBase, fastapi_users_schemas.BaseUserCreate):
    """Base schema for user creation."""

    # Override for username field validation
    username: ValidatedUsername = None

    @field_validator("username")
    @classmethod
    def username_not_reserved(cls, v: str | None) -> str | None:
        """Reject reserved usernames."""
        return validate_username_not_reserved(v)

    # Override for OpenAPI schema configuration
    password: str = Field(json_schema_extra={"format": "password"}, min_length=8)


class UserCreate(UserCreateBase):
    """Create schema for users, optionally with organization to join."""

    organization_id: UUID4 | None = None

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": USER_CREATE_EXAMPLES})


class UserCreateWithOrganization(UserCreateBase):
    """Create schema for users with organization to create and own."""

    organization: OrganizationCreate

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": USER_CREATE_WITH_ORGANIZATION_EXAMPLES})


class OAuthAccountRead(BaseModel):
    """Read schema for OAuth accounts."""

    model_config: ConfigDict = ConfigDict(from_attributes=True)

    oauth_name: str
    account_id: str
    account_email: str


class UserReadPublic(UserBase):
    """Public read schema for users."""

    email: EmailStr


class UserReadProfile(UserBase):
    """Basic public profile info."""

    created_at: datetime | None


class PublicProfileView(UserReadProfile):
    """Detailed public profile view with aggregated stats."""

    product_count: int = Field(default=0, description="Number of products registered.")
    total_weight_kg: float = Field(default=0.0, description="Aggregate weight of products in kg.")
    image_count: int = Field(default=0, description="Total images uploaded.")
    top_category: str = Field(default="None", description="Most common product type.")

    @classmethod
    def from_profile_stats(
        cls,
        *,
        username: str | None,
        created_at: datetime | None,
        stats: ProfileStatsData,
    ) -> PublicProfileView:
        """Build a public profile view from a typed profile-stats snapshot."""
        return cls(
            username=username,
            created_at=created_at,
            product_count=stats.product_count,
            total_weight_kg=stats.total_weight_kg,
            image_count=stats.image_count,
            top_category=stats.top_category or "None",
        )


class UserRead(UserBase, fastapi_users_schemas.BaseUser[uuid.UUID]):
    """Read schema for users."""

    oauth_accounts: list[OAuthAccountRead] = Field(default_factory=list, description="List of linked OAuth accounts.")
    preferences: dict[str, object] = Field(
        default_factory=dict,
        description="User preferences.",
    )

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": USER_READ_EXAMPLES})


class UserReadWithOrganization(UserRead):
    """Read schema for users with organization."""

    organization: OrganizationRead | None = Field(default=None, description="Organization the user belongs to.")


class UserUpdate(UserBase, fastapi_users_schemas.BaseUserUpdate):
    """Update schema for users."""

    # Override for username field validation
    username: ValidatedUsername = None

    @field_validator("username")
    @classmethod
    def username_not_reserved(cls, v: str | None) -> str | None:
        """Reject reserved usernames."""
        return validate_username_not_reserved(v)

    organization_id: UUID4 | None = None

    # Override password field to include password format in JSON schema
    password: str | None = Field(default=None, json_schema_extra={"format": "password"}, min_length=8)

    preferences: dict[str, object] | None = Field(default=None, description="User preferences (partial merge).")

    model_config: ConfigDict = ConfigDict(json_schema_extra={"examples": USER_UPDATE_EXAMPLES})


### Authentication & Sessions ###
class RefreshTokenRequest(BaseModel):
    """Request schema for refreshing access token."""

    model_config = ConfigDict(json_schema_extra={"examples": REFRESH_TOKEN_REQUEST_EXAMPLES})

    refresh_token: SecretStr = Field(description="Refresh token obtained from login")


class RefreshTokenResponse(BaseModel):
    """Response for token refresh."""

    model_config = ConfigDict(json_schema_extra={"examples": REFRESH_TOKEN_RESPONSE_EXAMPLES})

    access_token: str = Field(description="New JWT access token")
    refresh_token: str = Field(description="Rotated refresh token")
    token_type: str = Field(default="bearer", description="Token type (always 'bearer')")
    expires_in: int = Field(description="Access token expiration time in seconds")
