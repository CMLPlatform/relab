"""Centralized OpenAPI examples for data-collection schemas and routers."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


PHYSICAL_PROPERTIES_CREATE_EXAMPLES = [
    {"weight_g": 20000, "height_cm": 150, "width_cm": 70, "depth_cm": 50}
]

PHYSICAL_PROPERTIES_READ_EXAMPLES = [
    {"id": 1, "weight_g": 20000, "height_cm": 150, "width_cm": 70, "depth_cm": 50}
]

PHYSICAL_PROPERTIES_UPDATE_EXAMPLES = [{"weight_g": 15000, "height_cm": 120}]

CIRCULARITY_PROPERTIES_EXAMPLE = {
    "recyclability_observation": "The product can be easily disassembled and materials separated",
    "recyclability_comment": "High recyclability rating",
    "recyclability_reference": "ISO 14021:2016",
    "repairability_observation": "Components are modular and can be replaced individually",
    "repairability_comment": "Good repairability score",
    "repairability_reference": "EN 45554:2020",
    "remanufacturability_observation": "Core components can be refurbished and reused",
    "remanufacturability_comment": "Suitable for remanufacturing",
    "remanufacturability_reference": "BS 8887-2:2009",
}

CIRCULARITY_PROPERTIES_CREATE_EXAMPLES = [CIRCULARITY_PROPERTIES_EXAMPLE]

CIRCULARITY_PROPERTIES_READ_EXAMPLES = [
    {
        "id": 1,
        **CIRCULARITY_PROPERTIES_EXAMPLE,
    }
]

CIRCULARITY_PROPERTIES_UPDATE_EXAMPLES = [
    {
        "recyclability_observation": "Updated observation on recyclability",
        "recyclability_comment": "Updated comment",
    }
]

PRODUCT_CREATE_BASE_EXAMPLE = {
    "name": "Office Chair",
    "description": "Complete chair assembly",
    "brand": "Brand 1",
    "model": "Model 1",
    "dismantling_time_start": "2025-09-22T14:30:45Z",
    "dismantling_time_end": "2025-09-22T16:30:45Z",
    "product_type_id": 1,
    "physical_properties": {
        "weight_g": 20000,
        "height_cm": 150,
        "width_cm": 70,
        "depth_cm": 50,
    },
    "videos": [
        {"url": "https://www.youtube.com/watch?v=123456789", "description": "Disassembly video"}
    ],
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
            "dismantling_time_start": "2025-09-22T14:30:45Z",
            "dismantling_time_end": "2025-09-22T16:30:45Z",
            "amount_in_parent": 1,
            "product_type_id": 2,
            "physical_properties": {
                "weight_g": 5000,
                "height_cm": 50,
                "width_cm": 40,
                "depth_cm": 30,
            },
            "components": [
                {
                    "name": "Seat Cushion",
                    "description": "Seat cushion assembly",
                    "amount_in_parent": 1,
                    "physical_properties": {
                        "weight_g": 2000,
                        "height_cm": 10,
                        "width_cm": 40,
                        "depth_cm": 30,
                    },
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

PRODUCT_CREATE_OPENAPI_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "basic": {
            "summary": "Basic product without components",
            "value": PRODUCT_CREATE_BASE_EXAMPLE,
        },
        "with_components": {
            "summary": "Product with components",
            "value": PRODUCT_CREATE_WITH_COMPONENTS_EXAMPLE,
        },
    },
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

COMPONENT_CREATE_OPENAPI_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "simple": {
            "summary": "Basic component",
            "description": "Create a component without subcomponents",
            "value": COMPONENT_CREATE_SIMPLE_EXAMPLE,
        },
        "nested": {
            "summary": "Component with subcomponents",
            "description": "Create a component with nested subcomponents",
            "value": COMPONENT_CREATE_NESTED_EXAMPLE,
        },
    },
)

PRODUCT_INCLUDE_OPENAPI_EXAMPLES = cast(
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

PRODUCT_MATERIAL_LINKS_BULK_EXAMPLE = [
    {"material_id": 1, "quantity": 5, "unit": "g"},
    {"material_id": 2, "quantity": 10, "unit": "g"},
]

PRODUCT_MATERIAL_LINKS_BULK_OPENAPI_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "multiple_materials": {
            "summary": "Add multiple materials",
            "value": PRODUCT_MATERIAL_LINKS_BULK_EXAMPLE,
        }
    },
)

PRODUCT_MATERIAL_ID_PATH_OPENAPI_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "material_id": {
            "summary": "Existing material ID",
            "value": 1,
        }
    },
)

PRODUCT_SINGLE_MATERIAL_LINK_EXAMPLE = {"quantity": 5, "unit": "g"}

PRODUCT_SINGLE_MATERIAL_LINK_OPENAPI_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "single_material": {
            "summary": "Link details for one material",
            "value": PRODUCT_SINGLE_MATERIAL_LINK_EXAMPLE,
        }
    },
)

PRODUCT_REMOVE_MATERIAL_IDS_OPENAPI_EXAMPLES = cast(
    "dict[str, Example]",
    {
        "multiple_material_ids": {
            "summary": "Remove multiple material links",
            "value": [1, 2, 3],
        }
    },
)
