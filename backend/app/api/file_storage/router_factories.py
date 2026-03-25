"""Shared router builders for parent-scoped file storage endpoints."""

import json
from collections.abc import Callable
from enum import StrEnum
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Form, Path, Security, UploadFile
from fastapi import File as FastAPIFile
from fastapi_filter import FilterDepends
from pydantic import UUID4, BeforeValidator

from app.api.common.models.base import APIModelName
from app.api.common.models.custom_types import IDT
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.crud import ParentStorageOperations
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, Image, MediaParentType
from app.api.file_storage.presentation import serialize_file_read, serialize_image_read
from app.api.file_storage.schemas import (
    FileCreate,
    FileReadWithinParent,
    ImageCreateFromForm,
    ImageReadWithinParent,
    empty_str_to_none,
)

BaseDep = Callable[[], Any]
ParentIdDep = Callable[[IDT], Any]
STORAGE_EXTENSION_MAP = {"file": "csv", "image": "jpg"}


class StorageRouteMethod(StrEnum):
    """Enum for storage route methods."""

    GET = "get"
    POST = "post"
    DELETE = "delete"


def _build_passthrough_parent_dependency(parent_id_param: str, parent_title: str) -> ParentIdDep:
    """Create a default dependency that simply reads the parent id from the path."""

    async def dependency(
        parent_id: Annotated[int, Path(alias=parent_id_param, description=f"ID of the {parent_title}")],
    ) -> int:
        return parent_id

    return dependency


def _storage_example(parent_title: str, *, storage_slug: str, storage_title: str) -> dict[str, Any]:
    """Build a standard OpenAPI example for a storage resource."""
    ext = STORAGE_EXTENSION_MAP[storage_slug]
    return {
        "id": 1,
        "filename": f"example.{ext}",
        "description": f"{parent_title} {storage_title}",
        f"{storage_slug}_url": f"/uploads/{storage_slug}s/example.{ext}",
        "created_at": "2025-09-22T14:30:45Z",
        "updated_at": "2025-09-22T14:30:45Z",
    }


def _add_file_routes(
    router: APIRouter,
    *,
    parent_api_model_name: APIModelName,
    storage_crud: ParentStorageOperations,
    include_methods: set[StorageRouteMethod],
    read_auth_dep: BaseDep | None,
    read_parent_auth_dep: ParentIdDep | None,
    modify_auth_dep: BaseDep | None,
    modify_parent_auth_dep: ParentIdDep | None,
) -> None:
    """Register file routes for a parent resource."""
    parent_title = parent_api_model_name.name_capital
    parent_id_param = f"{parent_api_model_name.name_snake}_id"
    read_parent_dep = read_parent_auth_dep or _build_passthrough_parent_dependency(parent_id_param, parent_title)
    modify_parent_dep = modify_parent_auth_dep or _build_passthrough_parent_dependency(parent_id_param, parent_title)
    example = _storage_example(parent_title, storage_slug="file", storage_title="File")

    if StorageRouteMethod.GET in include_methods:

        @router.get(
            f"/{{{parent_id_param}}}/files",
            response_model=list[FileReadWithinParent],
            description=f"Get all Files associated with the {parent_title}",
            dependencies=[Security(read_auth_dep)] if read_auth_dep else None,
            responses={
                200: {
                    "description": f"List of Files associated with the {parent_title}",
                    "content": {"application/json": {"example": [example]}},
                },
                404: {"description": f"{parent_title} not found"},
            },
            summary=f"Get {parent_title} Files",
        )
        async def get_files(
            session: AsyncSessionDep,
            parent_id: Annotated[int, Depends(read_parent_dep)],
            item_filter: FileFilter = FilterDepends(FileFilter),
        ) -> list[FileReadWithinParent]:
            """Get all files associated with the parent."""
            items = await storage_crud.get_all(session, parent_id, filter_params=item_filter)
            return [serialize_file_read(cast("File", item)) for item in items]

        @router.get(
            f"/{{{parent_id_param}}}/files/{{file_id}}",
            response_model=FileReadWithinParent,
            dependencies=[Security(read_auth_dep)] if read_auth_dep else None,
            description=f"Get specific {parent_title} File by ID",
            responses={
                200: {"description": "File found", "content": {"application/json": {"example": example}}},
                404: {"description": f"{parent_title} or file not found"},
            },
            summary=f"Get specific {parent_title} File",
        )
        async def get_file(
            parent_id: Annotated[int, Depends(read_parent_dep)],
            item_id: Annotated[UUID4, Path(alias="file_id", description="ID of the file")],
            session: AsyncSessionDep,
        ) -> FileReadWithinParent:
            """Get a specific file associated with the parent."""
            item = await storage_crud.get_by_id(session, parent_id, item_id)
            return serialize_file_read(cast("File", item))

    if StorageRouteMethod.POST in include_methods:

        @router.post(
            f"/{{{parent_id_param}}}/files",
            response_model=FileReadWithinParent,
            status_code=201,
            dependencies=[Security(modify_auth_dep)] if modify_auth_dep else None,
            description=f"Upload a new File for the {parent_title}",
            responses={
                201: {
                    "description": "File successfully uploaded",
                    "content": {"application/json": {"example": example}},
                },
                400: {"description": "Invalid file data"},
                404: {"description": f"{parent_title} not found"},
            },
            summary=f"Add File to {parent_title}",
        )
        async def upload_file(
            session: AsyncSessionDep,
            parent_id: Annotated[int, Depends(modify_parent_dep)],
            file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
            description: Annotated[str | None, Form()] = None,
        ) -> FileReadWithinParent:
            """Upload a new file for the parent."""
            item_data = FileCreate(
                file=file,
                description=description,
                parent_id=parent_id,
                parent_type=MediaParentType(parent_api_model_name.name_snake),
            )
            item = await storage_crud.create(session, parent_id, item_data)
            return serialize_file_read(item)

    if StorageRouteMethod.DELETE in include_methods:

        @router.delete(
            f"/{{{parent_id_param}}}/files/{{file_id}}",
            dependencies=[Security(modify_auth_dep)] if modify_auth_dep else None,
            description=f"Remove File from the {parent_title} and delete it from the storage.",
            responses={
                204: {"description": "File successfully removed"},
                404: {"description": f"{parent_title} or file not found"},
            },
            summary=f"Remove File from {parent_title}",
            status_code=204,
        )
        async def delete_file(
            parent_id: Annotated[int, Depends(modify_parent_dep)],
            item_id: Annotated[UUID4, Path(alias="file_id", description="ID of the file")],
            session: AsyncSessionDep,
        ) -> None:
            """Remove a file from the parent."""
            await storage_crud.delete(session, parent_id, item_id)


def _add_image_routes(
    router: APIRouter,
    *,
    parent_api_model_name: APIModelName,
    storage_crud: ParentStorageOperations,
    include_methods: set[StorageRouteMethod],
    read_auth_dep: BaseDep | None,
    read_parent_auth_dep: ParentIdDep | None,
    modify_auth_dep: BaseDep | None,
    modify_parent_auth_dep: ParentIdDep | None,
) -> None:
    """Register image routes for a parent resource."""
    parent_title = parent_api_model_name.name_capital
    parent_id_param = f"{parent_api_model_name.name_snake}_id"
    read_parent_dep = read_parent_auth_dep or _build_passthrough_parent_dependency(parent_id_param, parent_title)
    modify_parent_dep = modify_parent_auth_dep or _build_passthrough_parent_dependency(parent_id_param, parent_title)
    example = _storage_example(parent_title, storage_slug="image", storage_title="Image")

    if StorageRouteMethod.GET in include_methods:

        @router.get(
            f"/{{{parent_id_param}}}/images",
            response_model=list[ImageReadWithinParent],
            description=f"Get all Images associated with the {parent_title}",
            dependencies=[Security(read_auth_dep)] if read_auth_dep else None,
            responses={
                200: {
                    "description": f"List of Images associated with the {parent_title}",
                    "content": {"application/json": {"example": [example]}},
                },
                404: {"description": f"{parent_title} not found"},
            },
            summary=f"Get {parent_title} Images",
        )
        async def get_images(
            session: AsyncSessionDep,
            parent_id: Annotated[int, Depends(read_parent_dep)],
            item_filter: ImageFilter = FilterDepends(ImageFilter),
        ) -> list[ImageReadWithinParent]:
            """Get all images associated with the parent."""
            items = await storage_crud.get_all(session, parent_id, filter_params=item_filter)
            return [serialize_image_read(cast("Image", item)) for item in items]

        @router.get(
            f"/{{{parent_id_param}}}/images/{{image_id}}",
            response_model=ImageReadWithinParent,
            dependencies=[Security(read_auth_dep)] if read_auth_dep else None,
            description=f"Get specific {parent_title} Image by ID",
            responses={
                200: {"description": "Image found", "content": {"application/json": {"example": example}}},
                404: {"description": f"{parent_title} or image not found"},
            },
            summary=f"Get specific {parent_title} Image",
        )
        async def get_image(
            parent_id: Annotated[int, Depends(read_parent_dep)],
            item_id: Annotated[UUID4, Path(alias="image_id", description="ID of the image")],
            session: AsyncSessionDep,
        ) -> ImageReadWithinParent:
            """Get a specific image associated with the parent."""
            item = await storage_crud.get_by_id(session, parent_id, item_id)
            return serialize_image_read(cast("Image", item))

    if StorageRouteMethod.POST in include_methods:

        @router.post(
            f"/{{{parent_id_param}}}/images",
            response_model=ImageReadWithinParent,
            status_code=201,
            dependencies=[Security(modify_auth_dep)] if modify_auth_dep else None,
            description=f"Upload a new Image for the {parent_title}",
            responses={
                201: {
                    "description": "Image successfully uploaded",
                    "content": {"application/json": {"example": example}},
                },
                400: {"description": "Invalid image data"},
                404: {"description": f"{parent_title} not found"},
            },
            summary=f"Add Image to {parent_title}",
        )
        async def upload_image(
            session: AsyncSessionDep,
            parent_id: Annotated[int, Depends(modify_parent_dep)],
            file: Annotated[UploadFile, FastAPIFile(description="An image to upload")],
            description: Annotated[str | None, Form()] = None,
            image_metadata: Annotated[
                str | None,
                Form(
                    description="Image metadata in JSON string format",
                    examples=[r'{"foo_key": "foo_value", "bar_key": {"nested_key": "nested_value"}}'],
                ),
                BeforeValidator(empty_str_to_none),
            ] = None,
        ) -> ImageReadWithinParent:
            """Upload a new image for the parent."""
            item_data = ImageCreateFromForm.model_validate(
                {
                    "file": file,
                    "description": description,
                    "image_metadata": json.loads(image_metadata) if image_metadata is not None else None,
                    "parent_id": parent_id,
                    "parent_type": MediaParentType(parent_api_model_name.name_snake),
                }
            )
            item = await storage_crud.create(session, parent_id, item_data)
            return serialize_image_read(item)

    if StorageRouteMethod.DELETE in include_methods:

        @router.delete(
            f"/{{{parent_id_param}}}/images/{{image_id}}",
            dependencies=[Security(modify_auth_dep)] if modify_auth_dep else None,
            description=f"Remove Image from the {parent_title} and delete it from the storage.",
            responses={
                204: {"description": "Image successfully removed"},
                404: {"description": f"{parent_title} or image not found"},
            },
            summary=f"Remove Image from {parent_title}",
            status_code=204,
        )
        async def delete_image(
            parent_id: Annotated[int, Depends(modify_parent_dep)],
            item_id: Annotated[UUID4, Path(alias="image_id", description="ID of the image")],
            session: AsyncSessionDep,
        ) -> None:
            """Remove an image from the parent."""
            await storage_crud.delete(session, parent_id, item_id)


def add_storage_routes(
    router: APIRouter,
    *,
    parent_api_model_name: APIModelName,
    files_crud: ParentStorageOperations,
    images_crud: ParentStorageOperations,
    include_methods: set[StorageRouteMethod],
    read_auth_dep: BaseDep | None = None,
    read_parent_auth_dep: ParentIdDep | None = None,
    modify_auth_dep: BaseDep | None = None,
    modify_parent_auth_dep: ParentIdDep | None = None,
) -> None:
    """Add both file and image storage routes to a router."""
    _add_file_routes(
        router,
        parent_api_model_name=parent_api_model_name,
        storage_crud=files_crud,
        include_methods=include_methods,
        read_auth_dep=read_auth_dep,
        read_parent_auth_dep=read_parent_auth_dep,
        modify_auth_dep=modify_auth_dep,
        modify_parent_auth_dep=modify_parent_auth_dep,
    )
    _add_image_routes(
        router,
        parent_api_model_name=parent_api_model_name,
        storage_crud=images_crud,
        include_methods=include_methods,
        read_auth_dep=read_auth_dep,
        read_parent_auth_dep=read_parent_auth_dep,
        modify_auth_dep=modify_auth_dep,
        modify_parent_auth_dep=modify_parent_auth_dep,
    )
