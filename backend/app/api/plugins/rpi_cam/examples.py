"""Centralized OpenAPI examples for the Raspberry Pi Camera plugin."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.openapi_examples import openapi_example, openapi_examples

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


INCLUDE_STATUS_DISABLED = False
INCLUDE_STATUS_ENABLED = True
FORCE_REFRESH_DISABLED = False
FORCE_REFRESH_ENABLED = True


CAMERA_CREATE_EXAMPLES = [
    {
        "name": "Workbench Camera",
        "description": "Ceiling-mounted camera above the teardown bench",
        "relay_public_key_jwk": {
            "kty": "EC",
            "crv": "P-256",
            "x": "base64url-x-coordinate",
            "y": "base64url-y-coordinate",
            "kid": "cam-key-1",
        },
        "relay_key_id": "cam-key-1",
    }
]

CAMERA_READ_EXAMPLES = [
    {
        "id": "12345678-cc4e-405c-8553-7806424de2a1",
        "name": "Workbench Camera",
        "description": "Ceiling-mounted camera above the teardown bench",
        "owner_id": "87654321-cc4e-405c-8553-7806424de2a1",
        "relay_key_id": "cam-key-1",
        "relay_credential_status": "active",
        "relay_last_seen_at": None,
    }
]

CAMERA_UPDATE_EXAMPLES = [
    {
        "description": "Camera assigned to the repairability bench",
    }
]

CAMERA_INCLUDE_STATUS_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    disabled=openapi_example(INCLUDE_STATUS_DISABLED, summary="Return camera metadata only"),
    enabled=openapi_example(INCLUDE_STATUS_ENABLED, summary="Include current online status"),
)

CAMERA_FORCE_REFRESH_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    cached=openapi_example(FORCE_REFRESH_DISABLED, summary="Use cached status when available"),
    refresh=openapi_example(FORCE_REFRESH_ENABLED, summary="Bypass cache and query the camera directly"),
)

CAMERA_MODE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    photo=openapi_example("photo", summary="Initialize the camera for still capture"),
    video=openapi_example("video", summary="Initialize the camera for streaming or recording"),
)

CAMERA_CAPTURE_IMAGE_PRODUCT_ID_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    product_id=openapi_example(42, summary="Associate the captured image with a product")
)

CAMERA_CAPTURE_IMAGE_DESCRIPTION_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    image_description=openapi_example("Top-down capture from the first dismantling step", summary="Custom caption")
)

CAMERA_START_RECORDING_PRODUCT_ID_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    product_id=openapi_example(42, summary="Associate the recording with a product")
)

CAMERA_START_RECORDING_TITLE_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    custom_title=openapi_example("Vacuum cleaner teardown recording", summary="Custom YouTube title")
)

CAMERA_START_RECORDING_DESCRIPTION_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    custom_description=openapi_example(
        "Full teardown recording for the repairability workflow.",
        summary="Custom YouTube description",
    )
)

CAMERA_START_RECORDING_PRIVACY_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    private=openapi_example("private", summary="Only visible to the authenticated account"),
    unlisted=openapi_example("unlisted", summary="Anyone with the link can watch"),
)
