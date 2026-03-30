"""Shared query parameter aliases for data-collection routers."""

from __future__ import annotations

from typing import Annotated

from fastapi import Query

from app.api.data_collection.examples import PRODUCT_INCLUDE_OPENAPI_EXAMPLES

type ProductIncludeQueryParam = Annotated[
    set[str] | None,
    Query(
        description="Relationships to include",
        openapi_examples=PRODUCT_INCLUDE_OPENAPI_EXAMPLES,
    ),
]

type IncludeComponentsAsBaseProductsQueryParam = Annotated[
    bool | None,
    Query(description="Whether to include components as base products in the response"),
]
