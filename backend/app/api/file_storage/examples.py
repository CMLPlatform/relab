"""Centralized OpenAPI examples for file-storage schemas and routers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.api.common.openapi_examples import openapi_example, openapi_examples

if TYPE_CHECKING:
    from fastapi.openapi.models import Example


FILE_READ_WITHIN_PARENT_EXAMPLES = [
    {
        "id": "12345678-cc4e-405c-8553-7806424de2a1",
        "description": "Assembly manual PDF",
        "filename": "manual.pdf",
        "file_url": "/uploads/files/manuals/manual.pdf",
    }
]

IMAGE_READ_WITHIN_PARENT_EXAMPLES = [
    {
        "id": "12345678-cc4e-405c-8553-7806424de2a1",
        "description": "Front view of the product",
        "image_metadata": {"camera_make": "Raspberry Pi", "orientation": "landscape"},
        "filename": "front-view.webp",
        "image_url": "/uploads/images/products/front-view.webp",
        "thumbnail_url": "/images/12345678-cc4e-405c-8553-7806424de2a1/resized?width=200",
    }
]

VIDEO_CREATE_WITHIN_PRODUCT_EXAMPLES = [
    {
        "url": "https://www.youtube.com/watch?v=abcdefghijk",
        "title": "Full disassembly",
        "description": "Recorded teardown of the product",
        "video_metadata": {"duration_seconds": 420, "source": "youtube"},
    }
]

VIDEO_READ_WITHIN_PRODUCT_EXAMPLES = [
    {
        "id": 1,
        "url": "https://www.youtube.com/watch?v=abcdefghijk",
        "title": "Full disassembly",
        "description": "Recorded teardown of the product",
        "video_metadata": {"duration_seconds": 420, "source": "youtube"},
    }
]

VIDEO_UPDATE_WITHIN_PRODUCT_EXAMPLES = [
    {
        "title": "Updated disassembly title",
        "description": "Shortened version for publication",
        "video_metadata": {"edited": True},
    }
]

IMAGE_RESIZE_WIDTH_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    thumbnail=openapi_example(200, summary="Default thumbnail width"),
    gallery=openapi_example(800, summary="Larger gallery preview"),
)

IMAGE_RESIZE_HEIGHT_OPENAPI_EXAMPLES: dict[str, Example] = openapi_examples(
    unconstrained=openapi_example(None, summary="Preserve aspect ratio"),
    portrait=openapi_example(1200, summary="Constrain height for portrait images"),
)
