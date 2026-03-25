"""Shared route builders for background data routers."""

from __future__ import annotations

from inspect import Parameter, Signature
from typing import TYPE_CHECKING, Annotated, Protocol, cast

from fastapi import APIRouter, Body, Path
from pydantic import PositiveInt

from app.api.background_data.dependencies import CategoryFilterDep
from app.api.background_data.models import Category
from app.api.background_data.schemas import CategoryRead
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.query_params import relationship_include_query

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Sequence
    from typing import Any

    from fastapi.openapi.models import Example
    from pydantic import BaseModel
    from sqlmodel import SQLModel


class SupportsSignature(Protocol):
    """Callable object whose signature FastAPI should inspect."""

    __signature__: Signature


CategoryIncludeExamples = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "materials": {"value": ["materials"]},
        "all": {"value": ["materials", "product_types", "subcategories"]},
    },
)

TaxonomyCategoryIncludeExamples = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "taxonomy": {"value": ["taxonomy"]},
        "all": {"value": ["taxonomy", "subcategories"]},
    },
)

MaterialIncludeExamples = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "categories": {"value": ["categories"]},
        "all": {"value": ["categories", "files", "images", "product_links"]},
    },
)


def _set_signature(route_handler: Callable[..., Awaitable[Any]], parameters: Sequence[Parameter]) -> None:
    """Assign an explicit callable signature for FastAPI route generation."""
    cast("SupportsSignature", route_handler).__signature__ = Signature(parameters=list(parameters))


def _set_route_signature(
    route_handler: Callable[..., Awaitable[Any]],
    *,
    path_param_name: str,
    path_description: str,
    leading_parameters: Sequence[Parameter],
) -> None:
    """Assign a concrete FastAPI-compatible signature to a dynamically generated route handler."""
    _set_signature(
        route_handler,
        [
            *leading_parameters,
            Parameter(
                path_param_name,
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=PositiveInt,
                default=Path(..., description=path_description),
            ),
        ],
    )


def add_linked_category_read_routes(
    router: APIRouter,
    *,
    parent_path_param: str,
    parent_label: str,
    get_categories: Callable[[Any, int, set[str] | None, Any], Awaitable[Sequence[Category]]],
    get_category: Callable[[Any, int, int, set[str] | None], Awaitable[Category]],
) -> None:
    """Add shared read-only category link routes for a parent resource."""

    async def list_categories(**kwargs: object) -> Sequence[Category]:
        parent_id = cast("int", kwargs[parent_path_param])
        session = kwargs["session"]
        include = cast("set[str] | None", kwargs["include"])
        category_filter = kwargs["category_filter"]
        return await get_categories(session, parent_id, include, category_filter)

    async def get_single_category(**kwargs: object) -> Category:
        parent_id = cast("int", kwargs[parent_path_param])
        category_id = cast("int", kwargs["category_id"])
        include = cast("set[str] | None", kwargs["include"])
        session = kwargs["session"]
        return await get_category(session, parent_id, category_id, include)

    list_categories.__name__ = f"get_categories_for_{parent_path_param.removesuffix('_id')}"
    get_single_category.__name__ = f"get_category_for_{parent_path_param.removesuffix('_id')}"
    _set_route_signature(
        list_categories,
        path_param_name=parent_path_param,
        path_description=f"{parent_label} ID",
        leading_parameters=[
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "category_filter",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=CategoryFilterDep,
            ),
            Parameter(
                "include",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[
                    set[str] | None,
                    relationship_include_query(openapi_examples=TaxonomyCategoryIncludeExamples),
                ],
            ),
        ],
    )
    _set_route_signature(
        get_single_category,
        path_param_name=parent_path_param,
        path_description=f"{parent_label} ID",
        leading_parameters=[
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "category_id",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[PositiveInt, Path(description="Category ID")],
            ),
            Parameter(
                "include",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[
                    set[str] | None,
                    relationship_include_query(openapi_examples=TaxonomyCategoryIncludeExamples),
                ],
            ),
        ],
    )

    router.add_api_route(
        f"/{{{parent_path_param}}}/categories",
        list_categories,
        methods=["GET"],
        response_model=list[CategoryRead],
        summary=f"View categories of {parent_label.lower()}",
    )
    router.add_api_route(
        f"/{{{parent_path_param}}}/categories/{{category_id}}",
        get_single_category,
        methods=["GET"],
        response_model=CategoryRead,
        summary="Get category by ID",
    )


def add_linked_category_write_routes(
    router: APIRouter,
    *,
    parent_path_param: str,
    parent_label: str,
    add_categories: Callable[[Any, int, set[int]], Awaitable[Sequence[Category]]],
    add_category: Callable[[Any, int, int], Awaitable[Category]],
    remove_categories: Callable[[Any, int, int | set[int]], Awaitable[None]],
) -> None:
    """Add shared write category link routes for a parent resource."""

    async def add_categories_bulk(**kwargs: object) -> Sequence[Category]:
        parent_id = cast("int", kwargs[parent_path_param])
        category_ids = cast("set[int]", kwargs["category_ids"])
        session = kwargs["session"]
        return await add_categories(session, parent_id, set(category_ids))

    async def add_single_category(**kwargs: object) -> Category:
        parent_id = cast("int", kwargs[parent_path_param])
        category_id = cast("int", kwargs["category_id"])
        session = kwargs["session"]
        return await add_category(session, parent_id, category_id)

    async def remove_categories_bulk(**kwargs: object) -> None:
        parent_id = cast("int", kwargs[parent_path_param])
        category_ids = cast("set[int]", kwargs["category_ids"])
        session = kwargs["session"]
        await remove_categories(session, parent_id, set(category_ids))

    async def remove_single_category(**kwargs: object) -> None:
        parent_id = cast("int", kwargs[parent_path_param])
        category_id = cast("int", kwargs["category_id"])
        session = kwargs["session"]
        await remove_categories(session, parent_id, category_id)

    route_suffix = parent_path_param.removesuffix("_id")
    add_categories_bulk.__name__ = f"add_categories_to_{route_suffix}"
    add_single_category.__name__ = f"add_category_to_{route_suffix}"
    remove_categories_bulk.__name__ = f"remove_categories_from_{route_suffix}_bulk"
    remove_single_category.__name__ = f"remove_category_from_{route_suffix}"
    _set_route_signature(
        add_categories_bulk,
        path_param_name=parent_path_param,
        path_description=f"{parent_label} ID",
        leading_parameters=[
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "category_ids",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[
                    set[PositiveInt],
                    Body(
                        description=f"Category IDs to assign to the {parent_label.lower()}",
                        default_factory=set,
                        examples=[[1, 2, 3]],
                    ),
                ],
            ),
        ],
    )
    _set_route_signature(
        add_single_category,
        path_param_name=parent_path_param,
        path_description=f"{parent_label} ID",
        leading_parameters=[
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "category_id",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[
                    PositiveInt,
                    Path(description=f"ID of category to add to the {parent_label.lower()}"),
                ],
            ),
        ],
    )
    _set_route_signature(
        remove_categories_bulk,
        path_param_name=parent_path_param,
        path_description=f"{parent_label} ID",
        leading_parameters=[
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "category_ids",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[
                    set[PositiveInt],
                    Body(
                        description=f"Category IDs to remove from the {parent_label.lower()}",
                        default_factory=set,
                        examples=[[1, 2, 3]],
                    ),
                ],
            ),
        ],
    )
    _set_route_signature(
        remove_single_category,
        path_param_name=parent_path_param,
        path_description=f"{parent_label} ID",
        leading_parameters=[
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "category_id",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=Annotated[
                    PositiveInt,
                    Path(description=f"ID of category to remove from the {parent_label.lower()}"),
                ],
            ),
        ],
    )

    router.add_api_route(
        f"/{{{parent_path_param}}}/categories",
        add_categories_bulk,
        methods=["POST"],
        response_model=list[CategoryRead],
        summary=f"Add multiple categories to the {parent_label.lower()}",
        status_code=201,
    )
    router.add_api_route(
        f"/{{{parent_path_param}}}/categories/{{category_id}}",
        add_single_category,
        methods=["POST"],
        response_model=CategoryRead,
        summary=f"Add a category to the {parent_label.lower()}",
        status_code=201,
    )
    router.add_api_route(
        f"/{{{parent_path_param}}}/categories",
        remove_categories_bulk,
        methods=["DELETE"],
        summary=f"Remove multiple categories from the {parent_label.lower()}",
        status_code=204,
    )
    router.add_api_route(
        f"/{{{parent_path_param}}}/categories/{{category_id}}",
        remove_single_category,
        methods=["DELETE"],
        summary=f"Remove a category from the {parent_label.lower()}",
        status_code=204,
    )


def add_basic_admin_crud_routes(
    router: APIRouter,
    *,
    model_label: str,
    path_param: str,
    response_model: type[SQLModel],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    create_handler: Callable[..., Awaitable[object]],
    update_handler: Callable[..., Awaitable[object]],
    delete_handler: Callable[[Any, int], Awaitable[None]],
) -> None:
    """Add the standard create/update/delete admin routes for a simple background-data model."""

    async def create_model(**kwargs: object) -> object:
        session = kwargs["session"]
        payload = kwargs["payload"]
        return await create_handler(session, payload)

    async def update_model(**kwargs: object) -> object:
        session = kwargs["session"]
        model_id = cast("int", kwargs[path_param])
        payload = kwargs["payload"]
        return await update_handler(session, model_id, payload)

    async def delete_model(**kwargs: object) -> None:
        session = kwargs["session"]
        model_id = cast("int", kwargs[path_param])
        await delete_handler(session, model_id)

    route_suffix = path_param.removesuffix("_id")
    create_model.__name__ = f"create_{route_suffix}"
    update_model.__name__ = f"update_{route_suffix}"
    delete_model.__name__ = f"delete_{route_suffix}"
    _set_signature(
        create_model,
        [
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "payload",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=cast("Any", create_schema),
                default=Body(...),
            ),
        ],
    )
    _set_signature(
        update_model,
        [
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                "payload",
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=cast("Any", update_schema),
                default=Body(...),
            ),
            Parameter(
                path_param,
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=PositiveInt,
                default=Path(..., description=f"{model_label.title()} ID"),
            ),
        ],
    )
    _set_signature(
        delete_model,
        [
            Parameter("session", kind=Parameter.POSITIONAL_OR_KEYWORD, annotation=AsyncSessionDep),
            Parameter(
                path_param,
                kind=Parameter.POSITIONAL_OR_KEYWORD,
                annotation=PositiveInt,
                default=Path(..., description=f"{model_label.title()} ID"),
            ),
        ],
    )

    router.add_api_route(
        "",
        create_model,
        methods=["POST"],
        response_model=response_model,
        summary=f"Create {model_label}",
        status_code=201,
    )
    router.add_api_route(
        f"/{{{path_param}}}",
        update_model,
        methods=["PATCH"],
        response_model=response_model,
        summary=f"Update {model_label}",
    )
    router.add_api_route(
        f"/{{{path_param}}}",
        delete_model,
        methods=["DELETE"],
        summary=f"Delete {model_label}",
        status_code=204,
    )
