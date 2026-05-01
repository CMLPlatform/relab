"""Filter schemas for auth models."""

from typing import ClassVar  # Runtime import required by fastapi-filters get_type_hints

from fastapi_filters import FilterField, FilterOperator

from app.api.auth.models import User
from app.api.common.crud.filtering import BaseFilterSet

_TEXT_OPERATORS = [FilterOperator.ilike]


class UserFilter(BaseFilterSet):
    """FilterSet for User filtering."""

    filter_model: ClassVar[type[User]] = User
    sortable_fields: ClassVar[tuple[str, ...]] = ("email", "username")
    search_columns: ClassVar[tuple[object, ...]] = (User.email, User.username)

    email: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    username: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    is_active: FilterField[bool] = FilterField(operators=[FilterOperator.eq])
    is_superuser: FilterField[bool] = FilterField(operators=[FilterOperator.eq])
    is_verified: FilterField[bool] = FilterField(operators=[FilterOperator.eq])
