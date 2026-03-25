"""Shared query helpers and OpenAPI examples for data collection routers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, cast

from fastapi import APIRouter, Body
from pydantic import BaseModel, PositiveInt

from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.query_params import boolean_flag_query, relationship_include_query
from app.api.data_collection.dependencies import UserOwnedProductDep

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi.openapi.models import Example

PRODUCT_INCLUDE_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "none": {"value": []},
        "properties": {"value": ["physical_properties", "circularity_properties"]},
        "materials": {"value": ["bill_of_materials"]},
        "media": {"value": ["images", "videos", "files"]},
        "components": {"value": ["components"]},
        "all": {
            "value": [
                "physical_properties",
                "circularity_properties",
                "images",
                "videos",
                "files",
                "product_type",
                "bill_of_materials",
                "components",
            ]
        },
    },
)


def product_include_query() -> object:
    """Build the reusable product relationship include query definition."""
    return relationship_include_query(openapi_examples=PRODUCT_INCLUDE_EXAMPLES)


def include_components_as_base_products_query() -> object:
    """Build the reusable query flag for returning component rows as base products."""
    return boolean_flag_query(description="Whether to include components as base products in the response")


def add_product_property_routes[ReadModelT: BaseModel, CreateModelT: BaseModel, UpdateModelT: BaseModel](
    router: APIRouter,
    *,
    path_segment: str,
    resource_label: str,
    read_model: type[ReadModelT],
    create_model: type[CreateModelT],
    update_model: type[UpdateModelT],
    get_handler: Callable[[AsyncSessionDep, int], Awaitable[ReadModelT]],
    create_handler: Callable[[AsyncSessionDep, CreateModelT, int], Awaitable[ReadModelT]],
    update_handler: Callable[[AsyncSessionDep, int, UpdateModelT], Awaitable[ReadModelT]],
    delete_handler: Callable[[AsyncSessionDep, UserOwnedProductDep], Awaitable[None]],
) -> None:
    """Add the standard product property GET/POST/PATCH/DELETE routes."""

    async def get_property(product_id: PositiveInt, session: AsyncSessionDep) -> ReadModelT:
        return await get_handler(session, product_id)

    async def create_property(
        product: UserOwnedProductDep,
        session: AsyncSessionDep,
        properties: Annotated[dict[str, object], Body(...)],
    ) -> ReadModelT:
        return await create_handler(session, create_model.model_validate(properties), product.db_id)

    async def update_property(
        product: UserOwnedProductDep,
        session: AsyncSessionDep,
        properties: Annotated[dict[str, object], Body(...)],
    ) -> ReadModelT:
        return await update_handler(session, product.db_id, update_model.model_validate(properties))

    async def delete_property(
        product: UserOwnedProductDep,
        session: AsyncSessionDep,
    ) -> None:
        await delete_handler(session, product)

    route_name = path_segment.removesuffix("_properties")
    get_property.__name__ = f"get_product_{route_name}"
    create_property.__name__ = f"create_product_{route_name}"
    update_property.__name__ = f"update_product_{route_name}"
    delete_property.__name__ = f"delete_product_{route_name}"

    router.add_api_route(
        f"/{{product_id}}/{path_segment}",
        get_property,
        methods=["GET"],
        response_model=read_model,
        summary=f"Get product {resource_label}",
    )
    router.add_api_route(
        f"/{{product_id}}/{path_segment}",
        create_property,
        methods=["POST"],
        response_model=read_model,
        status_code=201,
        summary=f"Create product {resource_label}",
    )
    router.add_api_route(
        f"/{{product_id}}/{path_segment}",
        update_property,
        methods=["PATCH"],
        response_model=read_model,
        summary=f"Update product {resource_label}",
    )
    router.add_api_route(
        f"/{{product_id}}/{path_segment}",
        delete_property,
        methods=["DELETE"],
        status_code=204,
        summary=f"Delete product {resource_label}",
    )
