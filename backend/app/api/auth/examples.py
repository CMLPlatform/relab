"""Centralized OpenAPI examples for auth schemas and routers."""

from __future__ import annotations

from app.api.common.openapi_examples import openapi_example, openapi_examples

USER_CREATE_EXAMPLES = [
    {
        "email": "user@example.com",
        "password": "fake_password",
        "username": "username",
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
)
