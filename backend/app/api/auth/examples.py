"""Centralized OpenAPI examples for auth schemas and routers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.openapi_examples import openapi_example, openapi_examples

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


ORGANIZATION_CREATE_EXAMPLES = [
    {
        "name": "Reverse Engineering Lab",
        "location": "Leiden",
        "description": "Research group for product teardown and circularity analysis",
    }
]

USER_CREATE_EXAMPLES = [
    {
        "email": "user@example.com",
        "password": "fake_password",
        "username": "username",
        "organization_id": "1fa85f64-5717-4562-b3fc-2c963f66afa6",
    }
]

USER_CREATE_WITH_ORGANIZATION_EXAMPLES = [
    {
        "email": "user@example.com",
        "password": "fake_password",
        "username": "username",
        "organization": {
            "name": "organization",
            "location": "location",
            "description": "description",
        },
    }
]

USER_READ_EXAMPLES = [
    {
        "id": "1fa85f64-5717-4562-b3fc-2c963f66afa6",
        "email": "user@example.com",
        "is_active": True,
        "is_superuser": False,
        "is_verified": True,
        "username": "username",
    }
]

USER_UPDATE_EXAMPLES = [
    {
        "password": "newpassword",
        "email": "user@example.com",
        "is_active": True,
        "is_superuser": True,
        "is_verified": True,
        "username": "username",
        "organization_id": "1fa85f64-5717-4562-b3fc-2c963f66afa6",
    }
]

REFRESH_TOKEN_REQUEST_EXAMPLES = [
    {
        "refresh_token": "refresh-token-from-login",
    }
]

REFRESH_TOKEN_RESPONSE_EXAMPLES = [
    {
        "access_token": "new-jwt-access-token",
        "refresh_token": "rotated-refresh-token",
        "token_type": "bearer",
        "expires_in": 3600,
    }
]

USER_INCLUDE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    none=openapi_example([]),
    products=openapi_example(["products"]),
    all=openapi_example(["products", "organization"]),
)

ORGANIZATION_INCLUDE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    none=openapi_example([]),
    all=openapi_example(["owner", "members"]),
)

ADMIN_USERS_RESPONSE_EXAMPLES = openapi_examples(
    basic=openapi_example(
        [
            {
                "id": "12345678-cc4e-405c-8553-7806424de2a1",
                "username": "alice",
                "email": "alice@example.com",
                "is_active": True,
                "is_superuser": False,
                "is_verified": True,
            }
        ],
        summary="Users without relationships",
    ),
    with_organization=openapi_example(
        [
            {
                "id": "12345678-cc4e-405c-8553-7806424de2a1",
                "username": "alice",
                "email": "alice@example.com",
                "is_active": True,
                "is_superuser": False,
                "is_verified": True,
                "organization": {
                    "id": "12345678-cc4e-405c-8553-7806424de2a1",
                    "name": "University of Example",
                    "location": "Example City",
                    "description": "Example organization",
                },
            }
        ],
        summary="Users with organization",
    ),
)
