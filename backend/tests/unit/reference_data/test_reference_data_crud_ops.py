"""CRUD-operation tests for categorized reference data."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.api.reference_data.crud.categorized_resources import (
    MATERIAL_RESOURCE,
    PRODUCT_TYPE_RESOURCE,
    add_categorized_reference_categories,
    delete_categorized_reference,
    remove_categorized_reference_categories,
)
from app.api.reference_data.models import (
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
)
from tests.factories.models import CategoryFactory, MaterialFactory, ProductTypeFactory


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


async def test_add_categorized_material_categories_returns_validated_categories() -> None:
    """Adds material category links using the material link model."""
    session = _make_session()
    db_material = MaterialFactory.build(id=1)
    db_material.categories = []
    db_categories = [CategoryFactory.build(id=1)]

    with (
        patch("app.api.reference_data.crud.categorized_resources.require_model", return_value=db_material),
        patch(
            "app.api.reference_data.crud.categorized_resources.validate_category_taxonomy_domains",
            new=AsyncMock(return_value=db_categories),
        ),
        patch("app.api.reference_data.crud.categorized_resources.add_links", new=AsyncMock()) as add_links,
    ):
        result = await add_categorized_reference_categories(session, MATERIAL_RESOURCE, 1, {1})

    assert result == db_categories
    add_links.assert_awaited_once_with(
        session,
        id1=1,
        id1_attr=CategoryMaterialLink.material_id,
        id2_set={1},
        id2_attr=CategoryMaterialLink.category_id,
        link_model=CategoryMaterialLink,
    )


async def test_add_categorized_product_type_categories_returns_validated_categories() -> None:
    """Adds product-type category links using the product-type link model."""
    session = _make_session()
    db_product_type = ProductTypeFactory.build(id=1)
    db_product_type.categories = []
    db_categories = [CategoryFactory.build(id=1)]

    with (
        patch("app.api.reference_data.crud.categorized_resources.require_model", return_value=db_product_type),
        patch(
            "app.api.reference_data.crud.categorized_resources.validate_category_taxonomy_domains",
            new=AsyncMock(return_value=db_categories),
        ),
        patch("app.api.reference_data.crud.categorized_resources.add_links", new=AsyncMock()) as add_links,
    ):
        result = await add_categorized_reference_categories(session, PRODUCT_TYPE_RESOURCE, 1, {1})

    assert result == db_categories
    add_links.assert_awaited_once_with(
        session,
        id1=1,
        id1_attr=CategoryProductTypeLink.product_type_id,
        id2_set={1},
        id2_attr=CategoryProductTypeLink.category_id,
        link_model=CategoryProductTypeLink,
    )


async def test_remove_categorized_material_categories_deletes_existing_links() -> None:
    """Removes material category links after confirming they exist."""
    session = _make_session()
    db_material = MaterialFactory.build(id=1)
    db_material.categories = [CategoryFactory.build(id=2)]
    material_link = CategoryMaterialLink(material_id=1, category_id=2)
    session.execute.return_value = _scalar_result([material_link])

    with patch("app.api.reference_data.crud.categorized_resources.require_model", return_value=db_material):
        await remove_categorized_reference_categories(session, MATERIAL_RESOURCE, 1, {2})

    session.delete.assert_awaited_once_with(material_link)
    session.commit.assert_called_once()


async def test_remove_categorized_product_type_categories_deletes_existing_links() -> None:
    """Removes product-type category links after confirming they exist."""
    session = _make_session()
    db_product_type = ProductTypeFactory.build(id=1)
    db_product_type.categories = [CategoryFactory.build(id=2)]
    product_type_link = CategoryProductTypeLink(product_type_id=1, category_id=2)
    session.execute.return_value = _scalar_result([product_type_link])

    with patch("app.api.reference_data.crud.categorized_resources.require_model", return_value=db_product_type):
        await remove_categorized_reference_categories(session, PRODUCT_TYPE_RESOURCE, 1, {2})

    session.delete.assert_awaited_once_with(product_type_link)
    session.commit.assert_called_once()


async def test_delete_categorized_reference_deletes_media_before_resource() -> None:
    """Deletes attached files/images before deleting the reference-data resource."""
    session = _make_session()
    db_material = MaterialFactory.build(id=1)

    with (
        patch(
            "app.api.reference_data.crud.categorized_resources.require_locked_model",
            return_value=db_material,
        ) as require_resource,
        patch.object(MATERIAL_RESOURCE.files, "delete_all", new=AsyncMock()) as delete_files,
        patch.object(MATERIAL_RESOURCE.images, "delete_all", new=AsyncMock()) as delete_images,
    ):
        await delete_categorized_reference(session, MATERIAL_RESOURCE, 1)

    require_resource.assert_awaited_once_with(session, Material, 1)
    delete_files.assert_awaited_once_with(session, 1)
    delete_images.assert_awaited_once_with(session, 1)
    session.delete.assert_called_once_with(db_material)
    session.commit.assert_called_once()


def _scalar_result(items: list[object]) -> MagicMock:
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result
