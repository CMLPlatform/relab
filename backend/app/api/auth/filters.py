"""Fastapi-filter schemas for filtering User and Organization models."""

from typing import TYPE_CHECKING

from fastapi_filter import FilterDepends, with_prefix
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

    class Constants(Filter.Constants):  # noqa: D106 # Standard FastAPI-filter class
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

    class Constants(Filter.Constants):  # noqa: D106 # Standard FastAPI-filter class
        model = Organization

        search_model_fields: ClassVar[list[str]] = [
            "name",
            "location",
            "description",
        ]


class UserFilterWithRelationships(UserFilter):
    """FastAPI-filter class for User filtering with relationships."""

    organization: UserFilter | None = FilterDepends(with_prefix("owner", UserFilter))


class OrganizationFilterWithRelationships(OrganizationFilter):
    """FastAPI-filter class for Organization filtering with relationships."""

    owner: UserFilter | None = FilterDepends(with_prefix("owner", UserFilter))
    members: UserFilter | None = FilterDepends(with_prefix("users", UserFilter))
