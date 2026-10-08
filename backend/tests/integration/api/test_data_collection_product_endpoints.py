"""Integration tests for product-focused data-collection endpoints."""

import logging
from typing import TYPE_CHECKING

import pytest
from fastapi import status
from sqlalchemy import select, update

from app.api.data_collection.models.product import Product
from app.api.reference_data.models import Material, ProductType
from scripts.seed.factories.models import ProductFactory, UserFactory
from tests.constants import (
    BOM_QUANTITY,
    BOM_UNIT,
    BRAND_X,
    COMPONENT_NAME,
    HEIGHT_10,
    IF_MATCH_FRESH,
    NEW_PRODUCT_NAME,
    PRODUCT_BASE_NAME,
    PRODUCT_DESC,
    RECYCLABILITY_GOOD,
    UPDATED_PRODUCT_NAME,
    WEIGHT_500,
)

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from tests.fixtures.data import ProductGraph

pytestmark = pytest.mark.api


async def test_get_products(
    api_client: AsyncClient, db_session: AsyncSession, db_superuser: User, db_product_type: ProductType
) -> None:
    """GET /products returns the current product page."""
    product = Product(
        owner_id=db_superuser.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        product_type=db_product_type,
    )
    db_session.add(product)
    await db_session.flush()

    response = await api_client.get("/v1/products")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["items"]
    assert data["items"][0]["name"] == PRODUCT_BASE_NAME


async def test_brand_in_filter_matches_value_containing_comma(
    api_client: AsyncClient, db_session: AsyncSession, db_superuser: User, db_product_type: ProductType
) -> None:
    """brand[in] treats a comma inside a brand as a literal, not a value separator."""
    db_session.add_all(
        [
            Product(owner_id=db_superuser.id, name="Comma Brand", brand="johnson, inc", product_type=db_product_type),
            Product(owner_id=db_superuser.id, name="Other Brand", brand="acme", product_type=db_product_type),
        ]
    )
    await db_session.flush()

    response = await api_client.get("/v1/products", params={"brand[in]": "johnson, inc"})

    assert response.status_code == status.HTTP_200_OK
    names = {item["name"] for item in response.json()["items"]}
    assert names == {"Comma Brand"}


async def test_get_product_components_tree_includes_nested_components(
    api_client: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """GET /products/{id}/components/tree returns nested components at bounded depth."""
    response = await api_client.get(f"/v1/products/{setup_product_graph.product.id}/components/tree?recursion_depth=2")

    assert response.status_code == status.HTTP_200_OK
    assert [component["id"] for component in response.json()] == [setup_product_graph.component.id]


async def test_get_product_by_id(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/{id} returns the requested product."""
    response = await api_client.get(f"/v1/products/{setup_product.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == setup_product.id
    assert data["name"] == PRODUCT_BASE_NAME


async def test_get_product_by_id_supports_conditional_get(api_client: AsyncClient, setup_product: Product) -> None:
    """GET /products/{id} returns 304 when the entity tag matches."""
    first_response = await api_client.get(f"/v1/products/{setup_product.id}")
    assert first_response.status_code == status.HTTP_200_OK
    assert "etag" in first_response.headers

    second_response = await api_client.get(
        f"/v1/products/{setup_product.id}",
        headers={"If-None-Match": first_response.headers["etag"]},
    )

    assert second_response.status_code == status.HTTP_304_NOT_MODIFIED


async def test_create_product(
    api_client_superuser: AsyncClient, db_session: AsyncSession, db_product_type: ProductType
) -> None:
    """POST /products creates a new product."""
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_PRODUCT_NAME,
        "description": PRODUCT_DESC,
        "product_type_id": db_product_type.id,
        "weight_g": WEIGHT_500,
        "height_cm": HEIGHT_10,
        "circularity_properties": {"recyclability": RECYCLABILITY_GOOD},
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post("/v1/products", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == NEW_PRODUCT_NAME
    assert data["circularity_properties"]["recyclability"] == RECYCLABILITY_GOOD
    assert "id" in data


async def test_create_product_rejects_a_missing_component_material(
    api_client_superuser: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """A material id missing anywhere in the tree is a 404 naming it, and nothing is written."""
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    bom = [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}]
    missing_bom = [{"material_id": 999_999, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}]
    payload = {
        "name": NEW_PRODUCT_NAME,
        "bill_of_materials": bom,
        "components": [{"name": COMPONENT_NAME, "amount_in_parent": 1, "bill_of_materials": missing_bom}],
    }

    response = await api_client_superuser.post("/v1/products", json=payload)

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "do not exist: 999999" in response.text
    owned = await db_session.execute(select(Product.id).where(Product.owner_id == db_superuser.id))
    assert owned.first() is None


async def test_create_product_normalizes_empty_circularity_properties(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """POST /products returns null for empty circularity JSON."""
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    payload = {
        "name": NEW_PRODUCT_NAME,
        "circularity_properties": {},
        "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    }

    response = await api_client_superuser.post("/v1/products", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["circularity_properties"] is None


async def test_update_product(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """PATCH /products/{id} updates a product."""
    response = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME}, headers=IF_MATCH_FRESH
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == UPDATED_PRODUCT_NAME


async def test_update_product_requires_if_match(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """PATCH /products/{id} without If-Match is refused as invalid."""
    response = await api_client_superuser.patch(f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.parametrize("if_match", ['"2"', "1", 'W/"1"', "*", '"1", "2"'])
async def test_update_product_refuses_stale_or_malformed_if_match(
    api_client_superuser: AsyncClient, setup_product: Product, if_match: str
) -> None:
    """A version other than the stored one, or a tag that is not a strong quoted version, is a 412."""
    response = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME}, headers={"If-Match": if_match}
    )

    assert response.status_code == status.HTTP_412_PRECONDITION_FAILED


async def test_update_product_bumps_version(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """A changing update bumps the version; replaying the old version is a 412."""
    response = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}",
        json={"name": UPDATED_PRODUCT_NAME, "height_cm": HEIGHT_10},
        headers=IF_MATCH_FRESH,
    )
    stale = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}", json={"name": NEW_PRODUCT_NAME}, headers=IF_MATCH_FRESH
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["version"] == 2
    assert stale.status_code == status.HTTP_412_PRECONDITION_FAILED


async def test_update_product_without_changes_ignores_the_version(
    api_client_superuser: AsyncClient, setup_product: Product
) -> None:
    """An update that changes nothing succeeds even when stale, and keeps the version.

    That is what a retry of a save whose response was lost looks like: its first attempt
    already applied these values and moved the version on.
    """
    response = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}", json={"name": setup_product.name}, headers={"If-Match": '"7"'}
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["version"] == 1


async def test_update_product_compares_against_the_locked_row(
    api_client_superuser: AsyncClient, db_session: AsyncSession, setup_product: Product
) -> None:
    """The version check reads the row under the lock, not the instance the auth dependency loaded first.

    The session is shared with the request, so the dependency's read returns this in-memory
    instance; a stale in-memory version must not let a replayed edit through.
    """
    await db_session.execute(
        update(Product).where(Product.id == setup_product.id).values(version=2),
        execution_options={"synchronize_session": False},
    )
    assert setup_product.version == 1  # the identity map still holds the pre-update value

    response = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME}, headers=IF_MATCH_FRESH
    )

    assert response.status_code == status.HTTP_412_PRECONDITION_FAILED


async def test_delete_product(api_client_superuser: AsyncClient, setup_product: Product) -> None:
    """DELETE /products/{id} removes the product."""
    response = await api_client_superuser.delete(f"/v1/products/{setup_product.id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.parametrize("mfa_enabled", [True, False])
async def test_superuser_moderates_another_users_product_only_with_mfa(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    db_product_type: ProductType,
    db_material: Material,
    mfa_enabled: bool,  # noqa: FBT001
    caplog: pytest.LogCaptureFixture,
) -> None:
    """An MFA superuser may correct and delete someone else's product, but never add content to it."""
    other_user = await UserFactory.create_async(session=db_session, is_active=True)
    other_product = await ProductFactory.create_async(
        session=db_session, owner_id=other_user.id, product_type_id=db_product_type.id
    )
    db_superuser.mfa_enabled = mfa_enabled
    await db_session.flush()
    moderated = status.HTTP_200_OK if mfa_enabled else status.HTTP_404_NOT_FOUND

    with caplog.at_level(logging.INFO, logger="audit"):
        patch_response = await api_client_superuser.patch(
            f"/v1/products/{other_product.id}", json={"name": UPDATED_PRODUCT_NAME}, headers=IF_MATCH_FRESH
        )
    upload_response = await api_client_superuser.post(
        f"/v1/products/{other_product.id}/images",
        # NOTE: ownership is checked before the file is read, so the bytes need not be a real image.
        files={"file": ("image.gif", b"GIF89a", "image/gif")},
    )
    materials_response = await api_client_superuser.post(
        f"/v1/products/{other_product.id}/materials",
        json=[{"material_id": db_material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    )
    delete_response = await api_client_superuser.delete(f"/v1/products/{other_product.id}")

    assert patch_response.status_code == moderated
    if mfa_enabled:
        # The edit itself is audited, not only the moderation access that preceded it.
        assert any(getattr(r, "action", None) == "update" for r in caplog.records)
    assert upload_response.status_code == status.HTTP_404_NOT_FOUND
    assert materials_response.status_code == status.HTTP_404_NOT_FOUND
    assert delete_response.status_code == (status.HTTP_204_NO_CONTENT if mfa_enabled else status.HTTP_404_NOT_FOUND)


async def test_non_owner_cannot_update_product(api_client_user: AsyncClient, setup_product: Product) -> None:
    """PATCH /products/{id} hides products owned by another user."""
    response = await api_client_user.patch(
        f"/v1/products/{setup_product.id}", json={"name": UPDATED_PRODUCT_NAME}, headers=IF_MATCH_FRESH
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_non_owner_cannot_delete_product(api_client_user: AsyncClient, setup_product: Product) -> None:
    """DELETE /products/{id} hides products owned by another user."""
    response = await api_client_user.delete(f"/v1/products/{setup_product.id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_product_media_reads_are_public(api_client: AsyncClient, setup_product: Product) -> None:
    """Base-product media reads should not require ownership."""
    files_response = await api_client.get(f"/v1/products/{setup_product.id}/files")
    images_response = await api_client.get(f"/v1/products/{setup_product.id}/images")

    assert files_response.status_code == status.HTTP_200_OK
    assert images_response.status_code == status.HTTP_200_OK


async def test_current_user_products_filter(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    setup_product: Product,
    db_product_type: ProductType,
) -> None:
    """GET /v1/products?owner=me returns only the authenticated user's products."""
    other_user = await UserFactory.create_async(session=db_session, is_active=True)
    other_product = await ProductFactory.create_async(
        session=db_session, owner_id=other_user.id, product_type_id=db_product_type.id
    )

    response = await api_client_superuser.get("/v1/products?owner=me")

    assert response.status_code == status.HTTP_200_OK
    ids = [item["id"] for item in response.json()["items"]]
    assert setup_product.id in ids
    assert other_product.id not in ids


async def test_product_materials_reject_component_ids(
    api_client_superuser: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """Product material routes are scoped to base products only."""
    response = await api_client_superuser.get(f"/v1/products/{setup_product_graph.component.id}/materials")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_sorting_products_by_product_type_name_keeps_untyped_products(
    api_client: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    db_product_type: ProductType,
) -> None:
    """order_by=product_type_name must not drop products with no product_type.

    The join `apply_filter` adds for a sort-only relationship field must be an outer
    join; an inner join would silently exclude every product_type_id=NULL row.
    """
    typed_product = Product(
        owner_id=db_superuser.id, name=f"{PRODUCT_BASE_NAME}Typed", brand=BRAND_X, product_type=db_product_type
    )
    untyped_product = Product(owner_id=db_superuser.id, name=f"{PRODUCT_BASE_NAME}Untyped", brand=BRAND_X)
    db_session.add_all([typed_product, untyped_product])
    await db_session.flush()

    response = await api_client.get("/v1/products?order_by=product_type_name")

    assert response.status_code == status.HTTP_200_OK, response.text
    ids = [item["id"] for item in response.json()["items"]]
    assert typed_product.id in ids
    assert untyped_product.id in ids


async def test_product_materials_filter_by_material_name(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    setup_product: Product,
) -> None:
    """GET /products/{id}/materials?material_name= must not 500 and must match by name.

    list_material_links_for_product previously added its own `.join(Material)` on top of
    the join `apply_filter` adds for a `material_name` filter, producing an ambiguous
    second join to the same table.
    """
    material = Material(name="Steel")
    db_session.add(material)
    await db_session.flush()
    create_response = await api_client_superuser.post(
        f"/v1/products/{setup_product.id}/materials",
        json=[{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
    )
    assert create_response.status_code == status.HTTP_201_CREATED

    filtered_response = await api_client_superuser.get(f"/v1/products/{setup_product.id}/materials?material_name=steel")
    unfiltered_response = await api_client_superuser.get(f"/v1/products/{setup_product.id}/materials")

    assert filtered_response.status_code == status.HTTP_200_OK, filtered_response.text
    assert [item["material_id"] for item in filtered_response.json()] == [material.id]
    assert unfiltered_response.status_code == status.HTTP_200_OK
    assert [item["material_id"] for item in unfiltered_response.json()] == [material.id]


async def test_product_videos_reject_component_ids(
    api_client_superuser: AsyncClient,
    setup_product_graph: ProductGraph,
) -> None:
    """Product video routes are scoped to base products only."""
    response = await api_client_superuser.get(f"/v1/products/{setup_product_graph.component.id}/videos")

    assert response.status_code == status.HTTP_404_NOT_FOUND


async def test_product_video_lifecycle(
    api_client_superuser: AsyncClient,
    setup_product: Product,
) -> None:
    """A product video can be created, read back, updated and deleted."""
    create_response = await api_client_superuser.post(
        f"/v1/products/{setup_product.id}/videos",
        json={"url": "https://example.com/teardown", "title": "Teardown"},
    )
    assert create_response.status_code == status.HTTP_201_CREATED, create_response.text
    video_id = create_response.json()["id"]

    read_response = await api_client_superuser.get(f"/v1/products/{setup_product.id}/videos/{video_id}")
    assert read_response.status_code == status.HTTP_200_OK
    assert read_response.json()["title"] == "Teardown"

    update_response = await api_client_superuser.patch(
        f"/v1/products/{setup_product.id}/videos/{video_id}",
        json={"title": "Teardown, take two"},
    )
    assert update_response.status_code == status.HTTP_200_OK, update_response.text
    assert update_response.json()["title"] == "Teardown, take two"

    delete_response = await api_client_superuser.delete(f"/v1/products/{setup_product.id}/videos/{video_id}")
    assert delete_response.status_code == status.HTTP_204_NO_CONTENT

    assert (
        await api_client_superuser.get(f"/v1/products/{setup_product.id}/videos/{video_id}")
    ).status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
async def test_product_video_routes_reject_a_video_from_another_product(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    db_product_type: ProductType,
    setup_product: Product,
    method: str,
) -> None:
    """A video id only resolves under the product that owns it (400, the repo-wide mismatch code)."""
    other_product = Product(
        owner_id=db_superuser.id, name=NEW_PRODUCT_NAME, brand=BRAND_X, product_type=db_product_type
    )
    db_session.add(other_product)
    await db_session.flush()
    created = await api_client_superuser.post(
        f"/v1/products/{setup_product.id}/videos",
        json={"url": "https://example.com/teardown"},
    )
    video_id = created.json()["id"]

    url = f"/v1/products/{other_product.id}/videos/{video_id}"
    response = await api_client_superuser.request(method.upper(), url, json={} if method == "patch" else None)

    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.text


async def test_owner_me_without_a_session_is_unauthorized_not_an_error(api_client: AsyncClient) -> None:
    """``owner=me`` needs someone to be "me".

    Without the check the filter reads the id off an absent user, so an anonymous
    request would get a 500 where the honest answer is that it must sign in.
    """
    response = await api_client.get("/v1/products?owner=me")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Authentication required"


async def test_delete_product_with_components(
    api_client_superuser: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """DELETE /products/{id} removes a product that still has two levels of components.

    Detail reads load a product's components under ``raiseload("*")``. The delete used
    to hand those stale instances to the flush, which walked ``product_type`` on them
    and raised ``lazy='raise'``, but only when a component made the cascade walk at all.
    """
    created = await api_client_superuser.post("/v1/products", json={"name": PRODUCT_BASE_NAME})
    assert created.status_code == status.HTTP_201_CREATED, created.text
    product_id = created.json()["id"]
    component_ids = []
    for index in range(4):
        component = await api_client_superuser.post(
            f"/v1/products/{product_id}/components",
            json={"name": f"{COMPONENT_NAME}{index}", "amount_in_parent": 1},
        )
        assert component.status_code == status.HTTP_201_CREATED, component.text
        component_ids.append(component.json()["id"])
    # A second level, so the cascade has to reach below the direct components too.
    sub_component = await api_client_superuser.post(
        f"/v1/components/{component_ids[0]}/components",
        json={"name": f"{COMPONENT_NAME}-sub", "amount_in_parent": 1},
    )
    assert sub_component.status_code == status.HTTP_201_CREATED, sub_component.text
    component_ids.append(sub_component.json()["id"])

    # The detail read is what makes this a regression test: it is the only route that
    # applies raiseload("*"), leaving the components in this session's identity map as
    # the stale instances the delete then hands to the flush. Without it the test passes
    # against the unfixed code.
    detail = await api_client_superuser.get(f"/v1/products/{product_id}")
    assert detail.status_code == status.HTTP_200_OK, detail.text

    response = await api_client_superuser.delete(f"/v1/products/{product_id}")

    assert response.status_code == status.HTTP_204_NO_CONTENT, response.text
    assert await db_session.get(Product, product_id) is None
    for component_id in component_ids:
        assert await db_session.get(Product, component_id) is None
