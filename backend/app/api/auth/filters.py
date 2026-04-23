"""Fastapi-filter schemas for filtering User and Organization models."""

from typing import TYPE_CHECKING

from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.auth.models import Organization, User

if TYPE_CHECKING:
    from typing import ClassVar


class UserFilter(Filter):
    """FastAPI-filter class for User filtering."""

    email__ilike: str | None = None
    username__ilike: str | None = None
    organization__ilike: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None
    is_verified: bool | None = None

    search: str | None = None

    class Constants(Filter.Constants):
        """Constants for UserFilter."""

        model = User

        search_model_fields: ClassVar[list[str]] = [
            "email",
            "username",
        ]


class OrganizationFilter(Filter):
    """FastAPI-filter class for Organization filtering."""

    name__ilike: str | None = None
    location__ilike: str | None = None
    description__ilike: str | None = None

    search: str | None = None

    order_by: list[str] | None = None

    class Constants(Filter.Constants):
        """Constants for OrganizationFilter."""

        model = Organization

        search_model_fields: ClassVar[list[str]] = [
            "name",
            "location",
            "description",
        ]
