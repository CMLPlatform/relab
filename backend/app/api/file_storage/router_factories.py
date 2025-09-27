"""Common generator functions for routers."""

from collections.abc import Callable, Sequence
from enum import Enum
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, Form, Path, Security, UploadFile
from fastapi import File as FastAPIFile
from fastapi_filter import FilterDepends
from pydantic import UUID4, BeforeValidator

from app.api.common.models.base import APIModelName
from app.api.common.models.custom_types import IDT
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.crud import ParentStorageOperations
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.models.models import File, Image
from app.api.file_storage.schemas import (
    FileCreate,
    FileReadWithinParent,
    ImageCreateFromForm,
    ImageReadWithinParent,
    empty_str_to_none,
)

StorageModel = TypeVar("StorageModel", File, Image)
ReadSchema = TypeVar("ReadSchema", FileReadWithinParent, ImageReadWithinParent)
CreateSchema = TypeVar("CreateSchema", FileCreate, ImageCreateFromForm)
FilterSchema = TypeVar("FilterSchema", FileFilter, ImageFilter)

BaseDep = Callable[[], Any]  # Base auth dependency
ParentIdDep = Callable[[IDT], Any]  # Dependency with parent_id parameter

# Map of example extension for each storage type
STORAGE_EXTENSION_MAP: dict = {"image": "jpg", "file": "csv"}


class StorageRouteMethod(str, Enum):
    """Enum for storage route methods."""

    GET = "get"
    POST = "post"
    DELETE = "delete"


# TODO: Simplify, or split it up in read and modify factories, or just create the routes manually for clarity
def add_storage_type_routes(
    router: APIRouter,
    *,
    parent_api_model_name: APIModelName,
    storage_crud: ParentStorageOperations,
    read_schema: type[ReadSchema],
    create_schema: type[CreateSchema],
    filter_schema: type[FilterSchema],
    include_methods: set[StorageRouteMethod],
    read_auth_dep: BaseDep | None = None,
    read_parent_auth_dep: ParentIdDep | None = None,
    modify_auth_dep: BaseDep | None = None,
    modify_parent_auth_dep: ParentIdDep | None = None,
) -> None:
    """Add storage routes for a specific storage type (files or images) to a router.

    Args:
        router (APIRouter): The router to add the routes to.
        parent_api_model_name (APIModelName): The parent model name.
        storage_crud (ParentStorageOperations): The CRUD operations for the storage type.
        read_schema (type[ReadSchema]): The schema to use for reading storage items.
        create_schema (type[CreateSchema]): The schema to use for creating storage items.
        filter_schema (type[FilterSchema]): The schema to use for filtering storage items.
        include_methods (set[StorageRouteMethods] | None, optional): The methods to include in the routes.
        read_auth_dep (Callable[[], Any] | None, optional): The authentication dependency for reading storage items.
                                                                Defaults to None.
        read_parent_auth_dep (Callable[[IDT], Any] | None, optional): The authentication dependency for reading
                                                                storage items with a given parent_id. Defaults to None.
        modify_auth_dep (Callable[[], Any] | None, optional): The authentication dependency for modifying storage items.
                                                                Defaults to None.
        modify_parent_auth_dep (Callable[[IDT], Any] | None, optional): The authentication dependency for modifying
                                                                storage items with a given parent_id. Defaults to None.
    """
    parent_slug_plural: str = parent_api_model_name.plural_slug
    parent_title: str = parent_api_model_name.name_capital
    parent_id_param: str = parent_api_model_name.name_snake + "_id"

    storage_type_title: str = read_schema.get_api_model_name().name_capital
    storage_type_title_plural: str = read_schema.get_api_model_name().plural_capital
    storage_type_slug: str = read_schema.get_api_model_name().name_slug
    storage_type_slug_plural = read_schema.get_api_model_name().plural_slug

    storage_type = storage_type_slug
    storage_ext: str = STORAGE_EXTENSION_MAP[storage_type]

    # HACK: Define null parent auth dependencies if none are provided
    # TODO: Simplify storage crud and router factories
    if read_parent_auth_dep is None:

        async def read_parent_auth_dep(
            parent_id: Annotated[int, Path(alias=parent_id_param, description=f"ID of the {parent_title}")],
        ) -> int:
            return parent_id

    if modify_parent_auth_dep is None:

        async def modify_parent_auth_dep(
            parent_id: Annotated[int, Path(alias=parent_id_param, description=f"ID of the {parent_title}")],
        ) -> int:
            return parent_id

    if StorageRouteMethod.GET in include_methods:

        @router.get(
            f"/{{{parent_id_param}}}/{storage_type_slug_plural}",
            description=f"Get all {storage_type_title_plural} associated with the {parent_title}",
            dependencies=[Security(read_auth_dep)] if read_auth_dep else None,
            response_model=list[read_schema],
            responses={
                200: {
                    "description": f"List of {storage_type_title_plural} associated with the {parent_title}",
                    "content": {
                        "application/json": {
                            "example": [
                                {
                                    "id": 1,
                                    "filename": f"example.{storage_ext}",
                                    "description": f"{parent_title} {storage_type_title}",
                                    f"{storage_type_slug}_url": f"/uploads/{parent_slug_plural}/1/example.{storage_ext}",
                                    "created_at": "2025-09-22T14:30:45Z",
                                    "updated_at": "2025-09-22T14:30:45Z",
                                }
                            ]
                        }
                    },
                },
                404: {"description": f"{parent_title} not found"},
            },
            summary=f"Get {parent_title} {storage_type_title_plural}",
        )
        async def get_items(
            session: AsyncSessionDep,
            parent_id: Annotated[int, Depends(read_parent_auth_dep)],
            item_filter: FilterSchema = FilterDepends(filter_schema),
        ) -> Sequence[StorageModel]:
            """Get all storage items associated with the parent."""
            return await storage_crud.get_all(session, parent_id, filter_params=item_filter)

        @router.get(
            f"/{{{parent_id_param}}}/{storage_type_slug_plural}/{{{storage_type_slug}_id}}",
            dependencies=[Security(read_auth_dep)] if read_auth_dep else None,
            description=f"Get specific {parent_title} {storage_type_title} by ID",
            response_model=read_schema,
            responses={
                200: {
                    "description": f"{storage_type.title()} found",
                    "content": {
                        "application/json": {
                            "example": {
                                "id": 1,
                                "filename": f"example.{storage_ext}",
                                "description": f"{parent_title} {storage_type_title}",
                                f"{storage_type_slug}_url": f"/uploads/{parent_slug_plural}/1/example.{storage_ext}",
                                "created_at": "2025-09-22T14:30:45Z",
                                "updated_at": "2025-09-22T14:30:45Z",
                            }
                        }
                    },
                },
                404: {"description": f"{parent_title} or {storage_type} not found"},
            },
            summary=f"Get specific {parent_title} {storage_type_title}",
        )
        async def get_item(
            parent_id: Annotated[int, Depends(read_parent_auth_dep)],
            item_id: Annotated[UUID4, Path(alias=f"{storage_type_slug}_id", description=f"ID of the {storage_type}")],
            session: AsyncSessionDep,
        ) -> StorageModel:
            """Get a specific storage item associated with the parent."""
            return await storage_crud.get_by_id(session, parent_id, item_id)

    if StorageRouteMethod.POST in include_methods:
        # HACK: This is an ugly way to differentiate between file and image uploads
        common_upload_route_params = {
            "path": f"/{{{parent_id_param}}}/{storage_type_slug_plural}",
            "dependencies": [Security(modify_auth_dep)] if modify_auth_dep else None,
            "description": f"Upload a new {storage_type_title} for the {parent_title}",
            "response_model": read_schema,
            "responses": {
                200: {
                    "description": f"{storage_type_title} successfully uploaded",
                    "content": {
                        "application/json": {
                            "example": {
                                "id": 1,
                                "filename": f"example.{storage_ext}",
                                "description": f"{parent_title} {storage_type_title}",
                                f"{storage_type_slug}_url": f"/uploads/{parent_slug_plural}/1/example.{storage_ext}",
                                "created_at": "2025-09-22T14:30:45Z",
                                "updated_at": "2025-09-22T14:30:45Z",
                            }
                        }
                    },
                },
                400: {"description": f"Invalid {storage_type} data"},
                404: {"description": f"{parent_title} not found"},
            },
            "summary": f"Add {storage_type_title} to {parent_title}",
        }

        if create_schema is ImageCreateFromForm:

            @router.post(**common_upload_route_params)
            async def upload_image(
                session: AsyncSessionDep,
                parent_id: Annotated[int, Depends(modify_parent_auth_dep)],
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
            ) -> StorageModel:
                """Upload a new image for the parent.

                Note that the parent id and type setting is handled in the crud operation.
                """
                item_data = ImageCreateFromForm(file=file, description=description, image_metadata=image_metadata)
                return await storage_crud.create(session, parent_id, item_data)

        elif create_schema is FileCreate:

            @router.post(**common_upload_route_params)
            async def upload_file(
                session: AsyncSessionDep,
                parent_id: Annotated[int, Depends(modify_parent_auth_dep)],
                file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
                description: Annotated[str | None, Form()] = None,
            ) -> StorageModel:
                """Upload a new file for the parent.

                Note that the parent id and type setting is handled in the crud operation.
                """
                item_data = FileCreate(file=file, description=description)
                return await storage_crud.create(session, parent_id, item_data)

        else:
            err_msg = "Invalid create schema"
            raise ValueError(err_msg)

    if StorageRouteMethod.DELETE in include_methods:

        @router.delete(
            f"/{{{parent_id_param}}}/{storage_type_slug_plural}/{{{storage_type_slug}_id}}",
            dependencies=[Security(modify_auth_dep)] if modify_auth_dep else None,
            description=f"Remove {storage_type_title} from the {parent_title} and delete it from the storage.",
            responses={
                204: {"description": f"{storage_type.title()} successfully removed"},
                404: {"description": f"{parent_title} or {storage_type} not found"},
            },
            summary=f"Remove {storage_type_title} from {parent_title}",
            status_code=204,
        )
        async def delete_item(
            parent_id: Annotated[int, Depends(modify_parent_auth_dep)],
            item_id: Annotated[UUID4, Path(alias=f"{storage_type_slug}_id", description=f"ID of the {storage_type}")],
            session: AsyncSessionDep,
        ) -> None:
            """Remove a storage item from the parent."""
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
    # Add file routes
    add_storage_type_routes(
        router=router,
        parent_api_model_name=parent_api_model_name,
        storage_crud=files_crud,
        read_schema=FileReadWithinParent,
        create_schema=FileCreate,
        filter_schema=FileFilter,
        include_methods=include_methods,
        read_auth_dep=read_auth_dep,
        read_parent_auth_dep=read_parent_auth_dep,
        modify_auth_dep=modify_auth_dep,
        modify_parent_auth_dep=modify_parent_auth_dep,
    )

    # Add image routes
    add_storage_type_routes(
        router=router,
        parent_api_model_name=parent_api_model_name,
        storage_crud=images_crud,
        read_schema=ImageReadWithinParent,
        create_schema=ImageCreateFromForm,
        filter_schema=ImageFilter,
        include_methods=include_methods,
        read_auth_dep=read_auth_dep,
        read_parent_auth_dep=read_parent_auth_dep,
        modify_auth_dep=modify_auth_dep,
        modify_parent_auth_dep=modify_parent_auth_dep,
    )
