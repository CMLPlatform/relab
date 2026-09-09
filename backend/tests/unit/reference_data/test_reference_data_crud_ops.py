"""CRUD-operation tests for categorized reference data."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.common.exceptions import ConflictError
from app.api.data_collection.models.product import MaterialProductLink
from app.api.reference_data.crud.categorized_resources import (
    MATERIAL_RESOURCE,
    PRODUCT_TYPE_RESOURCE,
    _require_not_in_use,
    add_categorized_reference_categories,
    delete_categorized_reference,
    remove_categorized_reference_categories,
)
from app.api.reference_data.models import (
    Category,
    CategoryMaterialLink,
    CategoryProductTypeLink,
    Material,
)
from app.api.reference_data.usage import _USAGE_GUARDS, register_reference_usage
from scripts.seed.factories.models import CategoryFactory, MaterialFactory, ProductTypeFactory


async def test_add_categorized_material_categories_returns_validated_categories(
    mock_session: AsyncMock,
) -> None:
    """Adds material category links using the material link model."""
    session = mock_session
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


async def test_add_categorized_product_type_categories_returns_validated_categories(
    mock_session: AsyncMock,
) -> None:
    """Adds product-type category links using the product-type link model."""
    session = mock_session
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


async def test_remove_categorized_material_categories_deletes_existing_links(
    mock_session: AsyncMock,
) -> None:
    """Removes material category links after confirming they exist."""
    session = mock_session
    db_material = MaterialFactory.build(id=1)
    db_material.categories = [CategoryFactory.build(id=2)]
    material_link = CategoryMaterialLink(material_id=1, category_id=2)
    session.execute.return_value = _scalar_result([material_link])

    with patch("app.api.reference_data.crud.categorized_resources.require_model", return_value=db_material):
        await remove_categorized_reference_categories(session, MATERIAL_RESOURCE, 1, {2})

    session.delete.assert_awaited_once_with(material_link)
    session.commit.assert_called_once()


async def test_remove_categorized_product_type_categories_deletes_existing_links(
    mock_session: AsyncMock,
) -> None:
    """Removes product-type category links after confirming they exist."""
    session = mock_session
    db_product_type = ProductTypeFactory.build(id=1)
    db_product_type.categories = [CategoryFactory.build(id=2)]
    product_type_link = CategoryProductTypeLink(product_type_id=1, category_id=2)
    session.execute.return_value = _scalar_result([product_type_link])

    with patch("app.api.reference_data.crud.categorized_resources.require_model", return_value=db_product_type):
        await remove_categorized_reference_categories(session, PRODUCT_TYPE_RESOURCE, 1, {2})

    session.delete.assert_awaited_once_with(product_type_link)
    session.commit.assert_called_once()


async def test_delete_categorized_reference_is_atomic_and_unlinks_bytes_after_commit(
    mock_session: AsyncMock,
) -> None:
    """Media rows and parent row drop in one transaction; bytes are unlinked only after commit.

    Two invariants, both safety-critical: (1) all row deletes happen before the single
    commit, so a mid-delete failure can't leave the parent behind with its media gone; and
    (2) the physical bytes are unlinked only after that commit, so a failed commit leaves
    the files intact rather than orphaning live rows that point at deleted bytes.
    """
    session = mock_session
    db_material = MaterialFactory.build(id=1)
    pending_files = [(object(), "file-path")]
    pending_images = [(object(), "image-path")]
    calls: list[object] = []

    async def _delete_files(*_a: object) -> list[object]:
        calls.append("files-rows")
        return pending_files

    async def _delete_images(*_a: object) -> list[object]:
        calls.append("images-rows")
        return pending_images

    async def _unlink(pending: list[object]) -> None:
        calls.append(("unlink", pending))

    with (
        patch(
            "app.api.reference_data.crud.categorized_resources.require_locked_model",
            return_value=db_material,
        ) as require_resource,
        patch.object(MATERIAL_RESOURCE.files, "delete_all", new=AsyncMock(side_effect=_delete_files)) as delete_files,
        patch.object(
            MATERIAL_RESOURCE.images, "delete_all", new=AsyncMock(side_effect=_delete_images)
        ) as delete_images,
        patch(
            "app.api.reference_data.crud.categorized_resources.unlink_stored_media",
            new=AsyncMock(side_effect=_unlink),
        ),
        # Nothing references the material; the guard has its own integration coverage.
        patch("app.api.reference_data.crud.categorized_resources._require_not_in_use", new=AsyncMock()),
    ):
        session.delete = AsyncMock(side_effect=lambda *_a: calls.append("parent-row"))
        session.commit = AsyncMock(side_effect=lambda: calls.append("commit"))
        await delete_categorized_reference(session, MATERIAL_RESOURCE, 1)

    require_resource.assert_awaited_once_with(session, Material, 1)
    delete_files.assert_awaited_once_with(session, 1)
    delete_images.assert_awaited_once_with(session, 1)
    session.delete.assert_called_once_with(db_material)
    assert calls == [
        "files-rows",
        "images-rows",
        "parent-row",
        "commit",
        ("unlink", pending_files),
        ("unlink", pending_images),
    ]


def _scalar_result(items: list[object]) -> MagicMock:
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result


async def test_a_reference_type_without_a_registered_column_refuses_to_delete(mock_session: AsyncMock) -> None:
    """A spec whose blocking column was never registered must fail closed, not delete.

    Reading a missing registration as "nothing references this" lets the delete through
    onto a NO ACTION foreign key, which answers 500 instead of naming the blocking
    relation — the exact outcome the guard exists to prevent.
    """
    with pytest.raises(LookupError, match="Category"):
        await _require_not_in_use(mock_session, MagicMock(model=Category), 1)


async def test_a_second_referencing_column_also_blocks_the_delete(mock_session: AsyncMock) -> None:
    """Registering a second referencing column adds a guard instead of replacing the first.

    Research data references each reference model from one column today, so only a test
    can hold the registry to more than one.
    """
    unreferenced, referenced = MagicMock(), MagicMock()
    unreferenced.first.return_value = None
    referenced.first.return_value = (1,)
    mock_session.execute = AsyncMock(side_effect=[unreferenced, referenced])

    with patch.dict(_USAGE_GUARDS, {Material: list(_USAGE_GUARDS[Material])}):
        register_reference_usage(Material, MaterialProductLink.material_id, "a second relation")

        with pytest.raises(ConflictError, match="a second relation"):
            await _require_not_in_use(mock_session, MATERIAL_RESOURCE, 1)
