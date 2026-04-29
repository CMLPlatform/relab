"""Shared utilities for public reference-data routers."""

from __future__ import annotations

from http import HTTPMethod
from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Query
from fastapi.types import DecoratedCallable
from sqlalchemy import inspect
from sqlalchemy.exc import NoInspectionAvailable
from sqlalchemy.orm.base import ATTR_EMPTY

from app.api.common.routers.openapi import PublicAPIRouter
from app.api.reference_data.models import Category
from app.api.reference_data.schemas import (
    CategoryRead,
    CategoryReadAsSubCategory,
    CategoryReadAsSubCategoryWithRecursiveSubCategories,
    CategoryReadWithRecursiveSubCategories,
)
from app.core.cache import cache
from app.core.config import CacheNamespace, settings

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any


class ReferenceDataAPIRouter(PublicAPIRouter):
    """Public reference data router that caches all GET endpoints."""

    def api_route(self, path: str, *args: Any, **kwargs: Any) -> Callable[[DecoratedCallable], DecoratedCallable]:  # noqa: ANN401 # Any-typed (kw)args are expected by the parent method signatures
        """Override api_route to apply caching to all GET endpoints."""
        methods = {method.upper() for method in (kwargs.get("methods") or [])}
        decorator = super().api_route(path, *args, **kwargs)

        if HTTPMethod.GET.value not in methods:
            return decorator

        def wrapper(func: DecoratedCallable) -> DecoratedCallable:
            cached = cache(
                expire=settings.cache.ttls[CacheNamespace.REFERENCE_DATA],
                namespace=CacheNamespace.REFERENCE_DATA,
            )(func)
            return cast("DecoratedCallable", decorator(cached))

        return wrapper


def _loaded_subcategories(category: Category) -> list[Category]:
    """Return preloaded subcategories without triggering lazy loads."""
    try:
        state = inspect(category)
    except NoInspectionAvailable:
        return []

    loaded_value = state.attrs[Category.subcategories.key].loaded_value
    if loaded_value is ATTR_EMPTY or loaded_value is None:
        return []
    return list(cast("list[Category]", loaded_value))


def convert_subcategories_to_read_model(
    subcategories: list[Category],
    max_depth: int = 1,
    current_depth: int = 0,
    *,
    visited: set[int] | None = None,
) -> list[CategoryReadAsSubCategoryWithRecursiveSubCategories]:
    """Convert preloaded subcategories to recursive read models without lazy loading."""
    if current_depth >= max_depth:
        return []

    visited = visited or set()
    read_subcategories: list[CategoryReadAsSubCategoryWithRecursiveSubCategories] = []
    for category in subcategories:
        if category.id in visited:
            continue
        next_visited = visited | {category.id}
        base = CategoryReadAsSubCategory.model_validate(category).model_dump()
        read_subcategories.append(
            CategoryReadAsSubCategoryWithRecursiveSubCategories(
                **base,
                subcategories=convert_subcategories_to_read_model(
                    _loaded_subcategories(category),
                    max_depth,
                    current_depth + 1,
                    visited=next_visited,
                ),
            )
        )
    return read_subcategories


def convert_categories_to_tree(
    categories: list[Category],
    *,
    recursion_depth: int,
) -> list[CategoryReadWithRecursiveSubCategories]:
    """Convert top-level categories to recursive read models without ORM recursion."""
    tree_items: list[CategoryReadWithRecursiveSubCategories] = []
    for category in categories:
        base = CategoryRead.model_validate(category).model_dump()
        tree_items.append(
            CategoryReadWithRecursiveSubCategories(
                **base,
                subcategories=convert_subcategories_to_read_model(
                    _loaded_subcategories(category),
                    max_depth=recursion_depth - 1,
                    visited={category.id},
                ),
            )
        )
    return tree_items


RecursionDepthQueryParam = Annotated[int, Query(ge=1, le=5, description="Maximum recursion depth")]
