"""Component-scoped file and image routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Form, Path, UploadFile
from fastapi import File as FastAPIFile
from pydantic import UUID4, BeforeValidator

from app.api.auth.dependencies import CurrentActiveVerifiedUserDep
from app.api.auth.services.rate_limiter import API_UPLOAD_RATE_LIMIT_DEPENDENCY
from app.api.common.crud.filtering import create_filter_dependency
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.data_collection.dependencies import ComponentDep, get_user_owned_component_id_from_component
from app.api.data_collection.routers.media_handlers import (
    handle_delete_file,
    handle_delete_image,
    handle_get_file,
    handle_get_image,
    handle_list_files,
    handle_list_images,
    handle_upload_file,
    handle_upload_image,
)
from app.api.file_storage.filters import FileFilter, ImageFilter
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent, empty_str_to_none

component_media_router = PublicAPIRouter(prefix="/components", tags=["components"])
_FILE_FILTER_DEPENDENCY = create_filter_dependency(FileFilter)
_IMAGE_FILTER_DEPENDENCY = create_filter_dependency(ImageFilter)


@component_media_router.get(
    "/{component_id}/files",
    response_model=list[FileReadWithinParent],
    summary="List files attached to a component",
)
async def get_component_files(
    db_component: ComponentDep,
    session: AsyncSessionDep,
    item_filter: FileFilter = Depends(_FILE_FILTER_DEPENDENCY),
) -> list[FileReadWithinParent]:
    """List all files attached to a component."""
    return await handle_list_files(session, db_component.id, item_filter)


@component_media_router.get(
    "/{component_id}/files/{file_id}",
    response_model=FileReadWithinParent,
    summary="Get a specific component file",
)
async def get_component_file(
    db_component: ComponentDep,
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> FileReadWithinParent:
    """Get a specific file attached to a component."""
    return await handle_get_file(session, db_component.id, file_id)


@component_media_router.post(
    "/{component_id}/files",
    response_model=FileReadWithinParent,
    status_code=201,
    summary="Upload a file to a component",
    dependencies=[API_UPLOAD_RATE_LIMIT_DEPENDENCY],
)
async def upload_component_file(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
    description: Annotated[str | None, Form()] = None,
) -> FileReadWithinParent:
    """Upload a new file for a component."""
    return await handle_upload_file(session, parent_id, file=file, description=description)


@component_media_router.delete(
    "/{component_id}/files/{file_id}",
    summary="Remove a file from a component",
    status_code=204,
)
async def delete_component_file(
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    file_id: Annotated[UUID4, Path(description="ID of the file")],
    session: AsyncSessionDep,
) -> None:
    """Remove a file from a component."""
    await handle_delete_file(session, parent_id, file_id)


@component_media_router.get(
    "/{component_id}/images",
    response_model=list[ImageReadWithinParent],
    summary="List images attached to a component",
)
async def get_component_images(
    db_component: ComponentDep,
    session: AsyncSessionDep,
    item_filter: ImageFilter = Depends(_IMAGE_FILTER_DEPENDENCY),
) -> list[ImageReadWithinParent]:
    """List all images attached to a component."""
    return await handle_list_images(session, db_component.id, item_filter)


@component_media_router.get(
    "/{component_id}/images/{image_id}",
    response_model=ImageReadWithinParent,
    summary="Get a specific component image",
)
async def get_component_image(
    db_component: ComponentDep,
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> ImageReadWithinParent:
    """Get a specific image attached to a component."""
    return await handle_get_image(session, db_component.id, image_id)


@component_media_router.post(
    "/{component_id}/images",
    response_model=ImageReadWithinParent,
    status_code=201,
    summary="Upload an image to a component",
    dependencies=[API_UPLOAD_RATE_LIMIT_DEPENDENCY],
)
async def upload_component_image(
    session: AsyncSessionDep,
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    file: Annotated[UploadFile, FastAPIFile(description="An image to upload")],
    current_user: CurrentActiveVerifiedUserDep,
    description: Annotated[str | None, Form()] = None,
    image_metadata: Annotated[
        str | None,
        Form(
            description="Image metadata in JSON string format",
            openapi_examples=IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES,
        ),
        BeforeValidator(empty_str_to_none),
    ] = None,
) -> ImageReadWithinParent:
    """Upload a new image for a component."""
    return await handle_upload_image(
        session,
        parent_id,
        file=file,
        description=description,
        image_metadata=image_metadata,
        current_user=current_user,
    )


@component_media_router.delete(
    "/{component_id}/images/{image_id}",
    summary="Remove an image from a component",
    status_code=204,
)
async def delete_component_image(
    parent_id: Annotated[int, Depends(get_user_owned_component_id_from_component)],
    image_id: Annotated[UUID4, Path(description="ID of the image")],
    session: AsyncSessionDep,
) -> None:
    """Remove an image from a component."""
    await handle_delete_image(session, parent_id, image_id)
