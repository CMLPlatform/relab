"""Filter schemas for auth models."""

from typing import ClassVar  # Runtime import required by fastapi-filters get_type_hints

from fastapi_filters import FilterField, FilterOperator

from app.api.auth.models import User
from app.api.common.crud.filtering import BaseFilterSet, filter_field

_TEXT_OPERATORS = [FilterOperator.ilike]


class UserFilter(BaseFilterSet):
    """FilterSet for User filtering."""

    filter_model: ClassVar[type[User]] = User
    sortable_fields: ClassVar[tuple[str, ...]] = ("email", "username")
    search_columns: ClassVar[tuple[object, ...]] = (User.email, User.username)

    email: FilterField[str] = filter_field(_TEXT_OPERATORS)
    username: FilterField[str] = filter_field(_TEXT_OPERATORS)
    is_active: FilterField[bool] = filter_field([FilterOperator.eq])
    is_superuser: FilterField[bool] = filter_field([FilterOperator.eq])
    is_verified: FilterField[bool] = filter_field([FilterOperator.eq])
