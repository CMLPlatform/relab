"""CRUD-operation tests for categorized reference data."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.api.reference_data.crud.categorized_resources import (
    MATERIAL_RESOURCE,
    PRODUCT_TYPE_RESOURCE,
    add_categorized_reference_categories,
    create_categorized_reference,
    delete_categorized_reference,
    remove_categorized_reference_categories,
)
from app.api.reference_data.models import (
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
    ProductType,
    TaxonomyDomain,
)
from app.api.reference_data.schemas import MaterialCreateWithCategories, ProductTypeCreateWithCategories
from tests.factories.models import CategoryFactory, MaterialFactory, ProductTypeFactory


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    return session


class TestCategorizedReferenceCrud:
    """Cover categorized material/product-type CRUD behavior."""

    async def test_create_categorized_reference_links_material_categories(self) -> None:
        """Creates a material and links validated material-domain categories."""
        session = _make_session()
        payload = MaterialCreateWithCategories(name="Steel", category_ids={1, 2})
        db_categories = [CategoryFactory.build(id=1), CategoryFactory.build(id=2)]

        with (
            patch(
                "app.api.reference_data.crud.categorized_resources.validate_category_taxonomy_domains",
                return_value=db_categories,
            ) as validate_categories,
            patch("app.api.reference_data.crud.categorized_resources.add_links", new=AsyncMock()) as add_links,
            patch("app.api.reference_data.crud.categorized_resources.commit_and_refresh", new=AsyncMock()) as commit,
        ):
            commit.side_effect = lambda _session, model, **_kwargs: model
            result = await create_categorized_reference(session, MATERIAL_RESOURCE, payload)

        assert isinstance(result, Material)
        assert result.name == "Steel"
        validate_categories.assert_awaited_once_with(session, {1, 2}, {TaxonomyDomain.MATERIALS})
        add_links.assert_awaited_once_with(
            session,
            id1=result.id,
            id1_attr=CategoryMaterialLink.material_id,
            id2_set={1, 2},
            id2_attr=CategoryMaterialLink.category_id,
            link_model=CategoryMaterialLink,
        )

    async def test_create_categorized_reference_links_product_type_categories(self) -> None:
        """Creates a product type and links validated product-domain categories."""
        session = _make_session()
        payload = ProductTypeCreateWithCategories(name="Laptop", category_ids={3})

        with (
            patch(
                "app.api.reference_data.crud.categorized_resources.validate_category_taxonomy_domains",
                return_value=[CategoryFactory.build(id=3)],
            ),
            patch("app.api.reference_data.crud.categorized_resources.add_links", new=AsyncMock()) as add_links,
            patch("app.api.reference_data.crud.categorized_resources.commit_and_refresh", new=AsyncMock()) as commit,
        ):
            commit.side_effect = lambda _session, model, **_kwargs: model
            result = await create_categorized_reference(session, PRODUCT_TYPE_RESOURCE, payload)

        assert isinstance(result, ProductType)
        assert result.name == "Laptop"
        add_links.assert_awaited_once_with(
            session,
            id1=result.id,
            id1_attr=CategoryProductTypeLink.product_type_id,
            id2_set={3},
            id2_attr=CategoryProductTypeLink.category_id,
            link_model=CategoryProductTypeLink,
        )

    async def test_add_categorized_material_categories_returns_validated_categories(self) -> None:
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

    async def test_add_categorized_product_type_categories_returns_validated_categories(self) -> None:
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

    async def test_remove_categorized_material_categories_deletes_existing_links(self) -> None:
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

    async def test_remove_categorized_product_type_categories_deletes_existing_links(self) -> None:
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

    async def test_delete_categorized_reference_deletes_media_before_resource(self) -> None:
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
