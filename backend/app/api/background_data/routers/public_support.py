"""Shared utilities for public background-data routers."""

from __future__ import annotations

from http import HTTPMethod
from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Query
from fastapi.types import DecoratedCallable

from app.api.background_data.models import Category
from app.api.background_data.schemas import CategoryReadAsSubCategoryWithRecursiveSubCategories
from app.api.common.routers.openapi import PublicAPIRouter
from app.core.cache import cache
from app.core.config import CacheNamespace, settings

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any


class BackgroundDataAPIRouter(PublicAPIRouter):
    """Public background data router that caches all GET endpoints."""

    def api_route(self, path: str, *args: Any, **kwargs: Any) -> Callable[[DecoratedCallable], DecoratedCallable]:  # noqa: ANN401 # Any-typed (kw)args are expected by the parent method signatures
        """Override api_route to apply caching to all GET endpoints."""
        methods = {method.upper() for method in (kwargs.get("methods") or [])}
        decorator = super().api_route(path, *args, **kwargs)

        if HTTPMethod.GET.value not in methods:
            return decorator

        def wrapper(func: DecoratedCallable) -> DecoratedCallable:
            cached = cache(
                expire=settings.cache.ttls[CacheNamespace.BACKGROUND_DATA],
                namespace=CacheNamespace.BACKGROUND_DATA,
            )(func)
            return cast("DecoratedCallable", decorator(cached))

        return wrapper


def convert_subcategories_to_read_model(
    subcategories: list[Category], max_depth: int = 1, current_depth: int = 0
) -> list[CategoryReadAsSubCategoryWithRecursiveSubCategories]:
    """Convert subcategories to read model recursively."""
    if current_depth >= max_depth:
        return []

    return [
        CategoryReadAsSubCategoryWithRecursiveSubCategories.model_validate(
            category,
            update={
                "subcategories": convert_subcategories_to_read_model(
                    category.subcategories or [], max_depth, current_depth + 1
                )
            },
        )
        for category in subcategories
    ]


RecursionDepthQueryParam = Annotated[int, Query(ge=1, le=5, description="Maximum recursion depth")]
