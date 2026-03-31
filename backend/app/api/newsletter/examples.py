"""Centralized OpenAPI examples for newsletter schemas and routers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.openapi_examples import openapi_example, openapi_examples

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


NEWSLETTER_SUBSCRIBER_READ_EXAMPLES = [
    {
        "id": "12345678-cc4e-405c-8553-7806424de2a1",
        "email": "subscriber@example.com",
        "is_confirmed": True,
    }
]

NEWSLETTER_PREFERENCE_READ_EXAMPLES = [
    {
        "email": "subscriber@example.com",
        "subscribed": True,
        "is_confirmed": True,
    }
]

NEWSLETTER_PREFERENCE_UPDATE_EXAMPLES = [
    {
        "subscribed": True,
    }
]

NEWSLETTER_EMAIL_BODY_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    subscriber_email=openapi_example("subscriber@example.com", summary="Newsletter subscriber email")
)

NEWSLETTER_TOKEN_BODY_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    confirmation_token=openapi_example(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature",
        summary="JWT-style confirmation or unsubscribe token",
    )
)
