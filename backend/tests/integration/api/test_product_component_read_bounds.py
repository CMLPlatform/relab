"""Public component reads return bounded responses however many components a product has."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.models.product import Product
from app.api.data_collection.routers import product_read_routers

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User

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
