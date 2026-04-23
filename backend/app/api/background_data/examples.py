"""Centralized OpenAPI examples for background-data schemas and routers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.openapi_examples import openapi_example, openapi_examples

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


CATEGORY_READ_AS_SUBCATEGORY_EXAMPLES = [
    {
        "id": 2,
        "name": "Ferrous metals",
        "description": "Iron and its alloys",
    }
]

CATEGORY_READ_EXAMPLES = [
    {
        "id": 2,
        "name": "Ferrous metals",
        "description": "Iron and its alloys",
        "taxonomy_id": 1,
        "supercategory_id": 1,
    }
]

CATEGORY_READ_RECURSIVE_EXAMPLES = [
    {
        "id": 1,
        "name": "Metals",
        "description": "All kinds of metals",
        "subcategories": [
            {
                "id": 2,
                "name": "Ferrous metals",
                "description": "Iron and its alloys",
                "subcategories": [
                    {
                        "id": 3,
                        "name": "Steel",
                        "description": "Steel alloys",
                    }
                ],
            }
        ],
    }
]

CATEGORY_UPDATE_EXAMPLES = [
    {
        "name": "Metals",
        "description": "All kinds of metals",
    }
]

TAXONOMY_READ_EXAMPLES = [
    {
        "name": "Materials Taxonomy",
        "description": "Taxonomy for materials",
        "domains": ["materials"],
        "source": "DOI:10.2345/12345",
    }
]

TAXONOMY_READ_WITH_TREE_EXAMPLES = [
    {
        "name": "Materials Taxonomy",
        "description": "Taxonomy for materials",
        "domains": ["materials"],
        "source": "DOI:10.2345/12345",
        "categories": [
            {
                "id": 1,
                "name": "Metals",
                "description": "All kinds of metals",
                "subcategories": [
                    {
                        "name": "Ferrous metals",
                        "description": "Iron and its alloys",
                        "subcategories": [{"name": "Steel", "description": "Steel alloys"}],
                    }
                ],
            }
        ],
    }
]

CATEGORY_INCLUDE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    none=openapi_example([]),
    materials=openapi_example(["materials"]),
    all=openapi_example(["materials", "product_types", "subcategories"]),
)

BACKGROUND_DATA_RESOURCE_INCLUDE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    none=openapi_example([]),
    categories=openapi_example(["categories"]),
    all=openapi_example(["categories", "files", "images", "product_links"]),
)

TAXONOMY_CATEGORY_INCLUDE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    none=openapi_example([]),
    taxonomy=openapi_example(["taxonomy"]),
    all=openapi_example(["taxonomy", "subcategories"]),
)

CATEGORY_IDS_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    multiple_category_ids=openapi_example([1, 2, 3], summary="Assign multiple categories"),
)
