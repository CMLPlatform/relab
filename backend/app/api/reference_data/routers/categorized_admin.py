"""Router factory for admin CRUD over categorized reference resources.

Materials and product types share the exact same admin surface (CRUD, category
links, file/image media); this factory builds it once per resource spec. Path
parameter names, function names, summaries, and docstrings are parameterized so
the two resources export parallel, consistently named OpenAPI operations. Category
links are managed through the plural body-based ``categories`` add/remove routes;
the older per-link ``/{id}/categories/{category_id}`` paths are intentionally gone.
"""

from typing import Annotated

from fastapi import APIRouter, Body, Form, Path, Security, UploadFile
from fastapi import File as FastAPIFile
from pydantic import UUID4, BaseModel, BeforeValidator, PositiveInt

from app.api.auth.dependencies import current_active_superuser
from app.api.common.openapi_examples import IMAGE_METADATA_JSON_STRING_OPENAPI_EXAMPLES
from app.api.common.rate_limiting import API_UPLOAD_RATE_LIMIT_DEPENDENCY
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.file_storage.schemas import FileReadWithinParent, ImageReadWithinParent, empty_str_to_none
from app.api.reference_data.crud.categorized_resources import (
    CategorizedReferenceSpec,
    add_categorized_reference_categories,
    create_categorized_reference,
    delete_categorized_reference,
    remove_categorized_reference_categories,
)
from app.api.reference_data.crud.persistence import update_reference_model
from app.api.reference_data.examples import CATEGORY_IDS_OPENAPI_EXAMPLES
from app.api.reference_data.models import Category
from app.api.reference_data.routers.reference_media import reference_file_create, reference_image_create
from app.api.reference_data.schemas import CategoryRead


def build_categorized_admin_router(  # noqa: C901 # linear factory: nine small endpoint defs, no real branching
    *,
    prefix: str,
    tag: str,
    label: str,
    id_param: str,
    spec: CategorizedReferenceSpec,
    create_schema: type[BaseModel],
    read_schema: type[BaseModel],
    update_schema: type[BaseModel],
) -> APIRouter:
    """Build the admin router for one categorized resource.

    Args:
        prefix: Router prefix, e.g. ``"/materials"``.
        tag: OpenAPI tag, e.g. ``"materials"``.
        label: Human label used in summaries/docstrings, e.g. ``"material"``.
        id_param: Public path-parameter name, e.g. ``"material_id"`` — kept
            stable via ``Path(alias=...)`` so generated clients don't change.
        spec: The resource's categorized-reference spec.
        create_schema: Request schema for create.
        read_schema: Response schema for create/update.
        update_schema: Request schema for partial update.
    """
    router = APIRouter(prefix=prefix, tags=[tag])
    title = label.title()
    name = id_param.removesuffix("_id")
    item_path = f"/{{{id_param}}}"

    # Local aliases used as endpoint annotations: FastAPI resolves them at
    # runtime via PEP 649 lazy annotations; type checkers can't, hence ignores.
    id_path = Annotated[PositiveInt, Path(alias=id_param, description=f"{title} ID")]
    media_id_path = Annotated[PositiveInt, Path(alias=id_param, description=f"ID of the {title}")]

    async def create_item(session: AsyncSessionDep, payload: create_schema) -> object:  # ty: ignore[invalid-type-form]
        return await create_categorized_reference(session, spec, payload)

    async def update_item(
        item_id: id_path,  # ty: ignore[invalid-type-form]
        session: AsyncSessionDep,
        payload: update_schema,  # ty: ignore[invalid-type-form]
    ) -> object:
        return await update_reference_model(session, spec.model, item_id, payload)

    async def delete_item(item_id: id_path, session: AsyncSessionDep) -> None:  # ty: ignore[invalid-type-form]
        await delete_categorized_reference(session, spec, item_id)

    async def add_categories(
        item_id: id_path,  # ty: ignore[invalid-type-form]
        session: AsyncSessionDep,
        category_ids: Annotated[
            set[int],
            Body(
                description=f"Category IDs to assign to the {label}",
                openapi_examples=CATEGORY_IDS_OPENAPI_EXAMPLES,
            ),
        ],
    ) -> list[Category]:
        return list(await add_categorized_reference_categories(session, spec, item_id, set(category_ids)))

    async def remove_categories(
        item_id: id_path,  # ty: ignore[invalid-type-form]
        session: AsyncSessionDep,
        category_ids: Annotated[
            set[int],
            Body(
                description=f"Category IDs to remove from the {label}",
                openapi_examples=CATEGORY_IDS_OPENAPI_EXAMPLES,
            ),
        ],
    ) -> None:
        await remove_categorized_reference_categories(session, spec, item_id, set(category_ids))

    async def upload_file(
        item_id: media_id_path,  # ty: ignore[invalid-type-form]
        session: AsyncSessionDep,
        file: Annotated[UploadFile, FastAPIFile(description="A file to upload")],
        description: Annotated[str | None, Form()] = None,
    ) -> FileReadWithinParent:
        item = await spec.files.create(
            session,
            item_id,
            reference_file_create(item_id, parent_type=spec.files.parent_type, file=file, description=description),
        )
        return FileReadWithinParent.model_validate(item)

    async def delete_file(
        item_id: media_id_path,  # ty: ignore[invalid-type-form]
        file_id: Annotated[UUID4, Path(description="ID of the file")],
        session: AsyncSessionDep,
    ) -> None:
        await spec.files.delete(session, item_id, file_id)

    async def upload_image(
        item_id: media_id_path,  # ty: ignore[invalid-type-form]
        session: AsyncSessionDep,
        file: Annotated[UploadFile, FastAPIFile(description="An image to upload")],
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
        item = await spec.images.create(
            session,
            item_id,
            reference_image_create(
                item_id,
                parent_type=spec.images.parent_type,
                file=file,
                description=description,
                image_metadata=image_metadata,
            ),
        )
        return ImageReadWithinParent.model_validate(item)

    async def delete_image(
        item_id: media_id_path,  # ty: ignore[invalid-type-form]
        image_id: Annotated[UUID4, Path(description="ID of the image")],
        session: AsyncSessionDep,
    ) -> None:
        await spec.images.delete(session, item_id, image_id)

    # Register with per-resource names/docstrings so operation ids (and thus
    # generated client method names) match the previous hand-written routers.
    endpoints = [
        (create_item, f"create_{name}", f"Create a {label}."),
        (update_item, f"update_{name}", f"Update a {label}."),
        (delete_item, f"delete_{name}", f"Delete a {label}."),
        (add_categories, f"add_categories_to_{name}", f"Add multiple categories to a {label}."),
        (remove_categories, f"remove_categories_from_{name}", f"Remove multiple categories from a {label}."),
        (upload_file, f"upload_{name}_file", f"Upload a new file for the {label}."),
        (delete_file, f"delete_{name}_file", f"Remove a file from the {label}."),
        (upload_image, f"upload_{name}_image", f"Upload a new image for the {label}."),
        (delete_image, f"delete_{name}_image", f"Remove an image from the {label}."),
    ]
    for endpoint, endpoint_name, doc in endpoints:
        endpoint.__name__ = endpoint_name
        endpoint.__doc__ = doc

    router.post("", response_model=read_schema, summary=f"Create {label}", status_code=201)(create_item)
    router.patch(item_path, response_model=read_schema, summary=f"Update {label}")(update_item)
    router.delete(item_path, summary=f"Delete {label}", status_code=204)(delete_item)
    router.post(
        f"{item_path}/categories",
        response_model=list[CategoryRead],
        summary=f"Add multiple categories to the {label}",
        status_code=201,
    )(add_categories)
    router.delete(
        f"{item_path}/categories",
        summary=f"Remove multiple categories from the {label}",
        status_code=204,
    )(remove_categories)
    router.post(
        f"{item_path}/files",
        response_model=FileReadWithinParent,
        status_code=201,
        dependencies=[Security(current_active_superuser), API_UPLOAD_RATE_LIMIT_DEPENDENCY],
        summary=f"Add File to {title}",
    )(upload_file)
    router.delete(
        f"{item_path}/files/{{file_id}}",
        dependencies=[Security(current_active_superuser)],
        summary=f"Remove File from {title}",
        status_code=204,
    )(delete_file)
    router.post(
        f"{item_path}/images",
        response_model=ImageReadWithinParent,
        status_code=201,
        dependencies=[Security(current_active_superuser), API_UPLOAD_RATE_LIMIT_DEPENDENCY],
        summary=f"Add Image to {title}",
    )(upload_image)
    router.delete(
        f"{item_path}/images/{{image_id}}",
        dependencies=[Security(current_active_superuser)],
        summary=f"Remove Image from {title}",
        status_code=204,
    )(delete_image)

    return router
