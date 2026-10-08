"""Public component reads return bounded responses however many components a product has."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.crud.product_tree_queries import MAX_COMPONENT_DEPTH
from app.api.data_collection.models.product import Product
from app.api.data_collection.routers import product_read_routers
from tests.fixtures.queries import count_queries

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from tests.fixtures.data import ProductGraph

pytestmark = pytest.mark.api


async def test_component_list_and_tree_are_capped(
    api_client: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The direct list pages its components; a tree over the component cap is a 400, not a huge payload."""
    root = Product(owner_id=db_superuser.id, name="Bounded root")
    children = [
        Product(owner_id=db_superuser.id, name=f"Bounded child {index}", parent=root, amount_in_parent=1)
        for index in range(6)
    ]
    db_session.add_all([root, *children])
    await db_session.flush()
    monkeypatch.setattr(product_read_routers, "COMPONENT_TREE_MAX_COMPONENTS", 5)

    page = await api_client.get(f"/v1/products/{root.id}/components", params={"size": 4})
    tree = await api_client.get(f"/v1/products/{root.id}/components/tree")

    assert page.status_code == status.HTTP_200_OK
    assert (len(page.json()["items"]), page.json()["total"]) == (4, 6)
    assert tree.status_code == status.HTTP_400_BAD_REQUEST
    assert "more than 5 components" in tree.text

    # One grandchild under the cap passes at depth 1 and trips it at depth 2.
    monkeypatch.setattr(product_read_routers, "COMPONENT_TREE_MAX_COMPONENTS", 6)
    db_session.add(Product(owner_id=db_superuser.id, name="Bounded grandchild", parent=children[0], amount_in_parent=1))
    await db_session.flush()

    shallow = await api_client.get(f"/v1/products/{root.id}/components/tree", params={"recursion_depth": 1})
    deep = await api_client.get(f"/v1/products/{root.id}/components/tree", params={"recursion_depth": 2})

    assert shallow.status_code == status.HTTP_200_OK
    assert len(shallow.json()) == 6
    assert deep.status_code == status.HTTP_400_BAD_REQUEST


async def test_component_tree_depth_reaches_the_nesting_limit(
    api_client: AsyncClient, setup_product_graph: ProductGraph
) -> None:
    """The tree route accepts as many levels as components may nest, and no more."""
    url = f"/v1/products/{setup_product_graph.product.id}/components/tree"

    deepest = await api_client.get(url, params={"recursion_depth": MAX_COMPONENT_DEPTH})
    too_deep = await api_client.get(url, params={"recursion_depth": MAX_COMPONENT_DEPTH + 1})

    assert MAX_COMPONENT_DEPTH == 10
    assert deepest.status_code == status.HTTP_200_OK
    assert too_deep.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


async def test_product_reads_load_only_the_owner_columns_they_render(
    api_client: AsyncClient, setup_product_graph: ProductGraph
) -> None:
    """Owner attribution needs the username and privacy settings, not the MFA secret or OAuth links."""
    product_id = setup_product_graph.product.id
    with count_queries() as statements:
        for url in (
            "/v1/products",
            f"/v1/products/{product_id}",
            f"/v1/products/{product_id}/components",
            f"/v1/products/{product_id}/components/tree",
        ):
            assert (await api_client.get(url)).status_code == status.HTTP_200_OK

    owner_sql = [sql for sql in statements if 'FROM "user"' in sql]
    assert owner_sql, "the owner is still loaded for attribution"
    for sql in owner_sql:
        assert "oauthaccount" not in sql
        assert "mfa_totp_secret" not in sql
