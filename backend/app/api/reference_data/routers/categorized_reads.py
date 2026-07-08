"""Public read helpers for categorized reference data."""

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.api.common.crud.filtering import SUB_RESOURCE_LIMIT, apply_filter
from app.api.common.crud.loading import apply_loader_profile
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.query import require_model
from app.api.reference_data.models import Category, CategoryMaterialLink, CategoryProductTypeLink, Material, ProductType
from app.api.reference_data.schemas import CategoryRead

if TYPE_CHECKING:
    from fastapi_pagination import Page
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm.attributes import InstrumentedAttribute

    from app.api.common.crud.filtering import BaseFilterSet
    from app.api.common.models.base import Base


CATEGORIZED_REFERENCE_LOADERS = {"categories", "images", "files"}


async def require_categorized_reference[ResourceT: Material | ProductType](
    session: AsyncSession,
    parent_model: type[ResourceT],
    parent_id: int,
    *,
    read_schema: type[object],
) -> ResourceT:
    """Load a categorized reference resource with standard public relationships."""
    return await require_model(
        session,
        parent_model,
        model_id=parent_id,
        loaders=CATEGORIZED_REFERENCE_LOADERS,
        read_schema=read_schema,
    )


async def page_categorized_references[ResourceT: Material | ProductType](
    session: AsyncSession,
    parent_model: type[ResourceT],
    *,
    parent_filter: BaseFilterSet,
    read_schema: type[object],
) -> Page[ResourceT]:
    """Page categorized reference resources with standard public relationships."""
    statement = select(parent_model)
    statement = apply_filter(statement, parent_filter)
    statement = apply_loader_profile(
        statement,
        parent_model,
        CATEGORIZED_REFERENCE_LOADERS,
        read_schema=read_schema,
    )
    return await paginate_select(session, statement, model=parent_model)


async def list_categorized_reference_categories(
    session: AsyncSession,
    *,
    parent_model: type[Base],
    parent_id: int,
    link_model: type[CategoryMaterialLink | CategoryProductTypeLink],
    link_parent_id_attr: InstrumentedAttribute[int],
    category_filter: BaseFilterSet,
) -> list[Category]:
    """List categories linked to a categorized reference resource."""
    await require_model(session, parent_model, parent_id)
    statement = (
        select(Category).join(link_model, Category.id == link_model.category_id).where(link_parent_id_attr == parent_id)
    )
    statement = apply_filter(statement, category_filter)
    statement = apply_loader_profile(statement, Category, read_schema=CategoryRead)
    statement = statement.limit(SUB_RESOURCE_LIMIT)
    return list((await session.execute(statement)).scalars().unique().all())
