"""Centralized OpenAPI examples for data-collection schemas and routers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.openapi_examples import openapi_example, openapi_examples

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


PRODUCT_CREATE_BASE_EXAMPLE = {
    "name": "Office Chair",
    "description": "Complete chair assembly",
    "brand": "Brand 1",
    "model": "Model 1",
    "product_type_id": 1,
    "weight_g": 20000,
    "height_cm": 150,
    "width_cm": 70,
    "depth_cm": 50,
    "circularity_properties": {
        "recyclability": "Metal frame and plastic shell can be separated with basic tools.",
        "disassemblability": "Most fasteners are visible and non-destructive to remove.",
    },
    "videos": [{"url": "https://www.youtube.com/watch?v=123456789", "description": "Disassembly video"}],
    "bill_of_materials": [
        {"quantity": 0.3, "unit": "g", "material_id": 1},
        {"quantity": 0.1, "unit": "g", "material_id": 2},
    ],
}

PRODUCT_CREATE_WITH_COMPONENTS_EXAMPLE = {
    **PRODUCT_CREATE_BASE_EXAMPLE,
    "components": [
        {
            "name": "Office Chair Seat",
            "description": "Seat assembly",
            "brand": "Brand 2",
            "model": "Model 2",
            "amount_in_parent": 1,
            "product_type_id": 2,
            "weight_g": 5000,
            "height_cm": 50,
            "width_cm": 40,
            "depth_cm": 30,
            "components": [
                {
                    "name": "Seat Cushion",
                    "description": "Seat cushion assembly",
                    "amount_in_parent": 1,
                    "weight_g": 2000,
                    "height_cm": 10,
                    "width_cm": 40,
                    "depth_cm": 30,
                    "product_type_id": 3,
                    "bill_of_materials": [
                        {"quantity": 1.5, "unit": "g", "material_id": 1},
                        {"quantity": 0.5, "unit": "g", "material_id": 2},
                    ],
                }
            ],
        }
    ],
}

PRODUCT_CREATE_EXAMPLES = [PRODUCT_CREATE_BASE_EXAMPLE]

PRODUCT_CREATE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    basic=openapi_example(PRODUCT_CREATE_BASE_EXAMPLE, summary="Basic product without components"),
    with_components=openapi_example(PRODUCT_CREATE_WITH_COMPONENTS_EXAMPLE, summary="Product with components"),
)

COMPONENT_CREATE_SIMPLE_EXAMPLE = {
    "name": "Seat Assembly",
    "description": "Chair seat component",
    "amount_in_parent": 1,
    "bill_of_materials": [{"material_id": 1, "quantity": 0.5, "unit": "g"}],
}

COMPONENT_CREATE_NESTED_EXAMPLE = {
    "name": "Seat Assembly",
    "description": "Chair seat with cushion",
    "amount_in_parent": 1,
    "components": [
        {
            "name": "Cushion",
            "description": "Foam cushion",
            "amount_in_parent": 1,
            "bill_of_materials": [{"material_id": 2, "quantity": 0.3, "unit": "g"}],
        }
    ],
}

COMPONENT_CREATE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    simple=openapi_example(
        COMPONENT_CREATE_SIMPLE_EXAMPLE,
        summary="Basic component",
        description="Create a component without subcomponents",
    ),
    nested=openapi_example(
        COMPONENT_CREATE_NESTED_EXAMPLE,
        summary="Component with subcomponents",
        description="Create a component with nested subcomponents",
    ),
)

PRODUCT_MATERIAL_LINKS_BULK_EXAMPLE = [
    {"material_id": 1, "quantity": 5, "unit": "g"},
    {"material_id": 2, "quantity": 10, "unit": "g"},
]

PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    multiple_materials=openapi_example(PRODUCT_MATERIAL_LINKS_BULK_EXAMPLE, summary="Add multiple materials"),
)

PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    material_id=openapi_example(1, summary="Existing material ID"),
)

PRODUCT_SINGLE_MATERIAL_LINK_EXAMPLE = {"quantity": 5, "unit": "g"}

PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    single_material=openapi_example(PRODUCT_SINGLE_MATERIAL_LINK_EXAMPLE, summary="Link details for one material"),
)

PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    multiple_material_ids=openapi_example([1, 2, 3], summary="Remove multiple material links"),
)
