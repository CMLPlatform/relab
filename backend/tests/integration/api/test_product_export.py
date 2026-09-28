"""Integration tests for the product export endpoints."""

import csv
import io
from typing import TYPE_CHECKING

import pytest
from fastapi import status

from app.api.data_collection.crud import product_tree_queries
from app.api.data_collection.crud.product_tree_queries import EXPORT_MAX_BASE_PRODUCTS, MAX_COMPONENT_DEPTH
from app.api.data_collection.models.product import Product
from app.api.data_collection.presentation.product_export import CSV_COLUMNS
from app.core.config.core import settings
from tests.fixtures.client import override_authenticated_user

if TYPE_CHECKING:
    from fastapi import FastAPI
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.auth.models import User
    from app.api.reference_data.models import ProductType
    from tests.fixtures.data import ProductGraph

pytestmark = pytest.mark.api

# 1x1 pixel GIF
GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04"
    b"\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)


def _csv_rows(text: str) -> tuple[list[str], list[dict[str, str]]]:
    reader = csv.DictReader(io.StringIO(text))
    return list(reader.fieldnames or []), list(reader)


@pytest.fixture
async def product_tree(db_session: AsyncSession, setup_product_graph: ProductGraph) -> tuple[Product, Product, Product]:
    """Base product -> component -> sub-component, three levels deep."""
    sub_component = Product(
        owner_id=setup_product_graph.product.owner_id,
        name="Screw",
        parent=setup_product_graph.component,
        amount_in_parent=4,
    )
    db_session.add(sub_component)
    await db_session.flush()
    return setup_product_graph.product, setup_product_graph.component, sub_component


async def _component_chain(db_session: AsyncSession, owner: User, levels: int) -> Product:
    """Add a base product with a single chain of ``levels`` nested components below it."""
    root = parent = Product(owner_id=owner.id, name="Chain")
    for level in range(levels):
        parent = Product(owner_id=owner.id, name=f"Level {level + 1}", parent=parent, amount_in_parent=1)
    db_session.add(root)
    await db_session.flush()
    return root


async def test_export_csv_has_one_row_per_node_linked_by_parent_id(
    api_client_light: AsyncClient, product_tree: tuple[Product, Product, Product], db_superuser: User
) -> None:
    """CSV follows the release column names and links every component to its parent."""
    product, component, sub_component = product_tree

    response = await api_client_light.get("/v1/products/export", params={"format": "csv"})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"].startswith('attachment; filename="relab-products-')
    assert response.headers["content-disposition"].endswith('.csv"')
    columns, rows = _csv_rows(response.text)
    assert columns == list(CSV_COLUMNS)
    assert [(row["id"], row["parent_id"]) for row in rows] == [
        (str(product.id), ""),
        (str(component.id), str(product.id)),
        (str(sub_component.id), str(component.id)),
    ]
    assert rows[2]["amount_in_parent"] == "4"
    assert rows[0]["owner_username"] == db_superuser.username


async def test_export_json_nests_the_whole_component_tree(
    api_client_light: AsyncClient, product_tree: tuple[Product, Product, Product]
) -> None:
    """JSON is the product detail read with components nested at every depth."""
    product, component, sub_component = product_tree

    response = await api_client_light.get(f"/v1/products/{product.id}/export", params={"format": "json"})

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["content-disposition"].startswith(f'attachment; filename="relab-product-{product.id}-')
    [exported] = response.json()
    assert exported["id"] == product.id
    assert {"images", "bill_of_materials", "product_type", "videos"} <= exported.keys()
    [child] = exported["components"]
    assert child["id"] == component.id
    assert [grandchild["id"] for grandchild in child["components"]] == [sub_component.id]


async def test_export_single_product_rejects_a_component_id(
    api_client_light: AsyncClient, setup_product_graph: ProductGraph
) -> None:
    """The per-product export only takes base products."""
    response = await api_client_light.get(f"/v1/products/{setup_product_graph.component.id}/export")

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.parametrize("params", [{"brand[in]": "acme"}, {"search": "kettle"}])
async def test_export_honors_the_list_filters(
    api_client_light: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    db_product_type: ProductType,
    params: dict[str, str],
) -> None:
    """The export matches what the product list would, filters and search included."""
    db_session.add_all(
        [
            Product(owner_id=db_superuser.id, name="Kept Kettle", brand="acme", product_type=db_product_type),
            Product(owner_id=db_superuser.id, name="Dropped Drill", brand="other", product_type=db_product_type),
        ]
    )
    await db_session.flush()

    response = await api_client_light.get("/v1/products/export", params={"format": "json", **params})

    assert response.status_code == status.HTTP_200_OK
    assert [item["name"] for item in response.json()] == ["Kept Kettle"]


async def test_export_past_the_cap_asks_to_narrow_the_filters(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """More matching base products than the cap is refused, not truncated."""
    db_session.add_all(
        Product(owner_id=db_superuser.id, name=f"Bulk {index}") for index in range(EXPORT_MAX_BASE_PRODUCTS + 1)
    )
    await db_session.flush()

    response = await api_client_light.get("/v1/products/export")

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert "Narrow the filters" in response.text


async def test_export_takes_a_tree_exactly_at_the_depth_limit(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """A component chain as deep as creation allows still exports."""
    root = await _component_chain(db_session, db_superuser, MAX_COMPONENT_DEPTH)

    response = await api_client_light.get(f"/v1/products/{root.id}/export")

    assert response.status_code == status.HTTP_200_OK
    _, rows = _csv_rows(response.text)
    assert len(rows) == MAX_COMPONENT_DEPTH + 1


async def test_export_refuses_a_tree_past_the_depth_limit(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """A chain nested deeper than the limit is refused rather than walked to the bottom."""
    root = await _component_chain(db_session, db_superuser, MAX_COMPONENT_DEPTH + 1)

    response = await api_client_light.get(f"/v1/products/{root.id}/export")

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert "This export is too large" in response.text


@pytest.mark.usefixtures("product_tree")
async def test_export_refuses_more_components_than_the_limit(
    api_client_light: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The component count is capped across the whole export, not per tree."""
    monkeypatch.setattr(product_tree_queries, "EXPORT_MAX_COMPONENTS", 2)
    at_limit = await api_client_light.get("/v1/products/export")
    other_root = Product(owner_id=db_superuser.id, name="Other")
    db_session.add(Product(owner_id=db_superuser.id, name="One more", parent=other_root, amount_in_parent=1))
    await db_session.flush()

    past_limit = await api_client_light.get("/v1/products/export")

    assert at_limit.status_code == status.HTTP_200_OK
    assert past_limit.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert "more than 2 components" in past_limit.text


async def test_export_csv_quotes_a_name_a_spreadsheet_would_run(
    api_client_light: AsyncClient, db_session: AsyncSession, db_superuser: User
) -> None:
    """A product name that starts like a formula comes out of the CSV as text."""
    db_session.add(Product(owner_id=db_superuser.id, name="=cmd|calc"))
    await db_session.flush()

    response = await api_client_light.get("/v1/products/export", params={"format": "csv"})

    _, rows = _csv_rows(response.text)
    assert [row["name"] for row in rows] == ["'=cmd|calc"]


async def test_export_hides_the_owner_of_a_hidden_profile(
    api_client_light: AsyncClient,
    db_session: AsyncSession,
    db_superuser: User,
    product_tree: tuple[Product, Product, Product],
) -> None:
    """An export shows the owner exactly as the product page does: blank when the profile is hidden."""
    product, _, _ = product_tree
    db_superuser.preferences = {"profile_visibility": "private"}
    await db_session.flush()

    csv_response = await api_client_light.get("/v1/products/export", params={"format": "csv"})
    json_response = await api_client_light.get(f"/v1/products/{product.id}/export", params={"format": "json"})

    _, rows = _csv_rows(csv_response.text)
    assert {row["owner_username"] for row in rows} == {""}
    [exported] = json_response.json()
    assert exported["owner_username"] is None
    assert exported["owner_id"] is None
    assert exported["components"][0]["owner_username"] is None


async def test_export_csv_lists_photos_as_absolute_urls(
    api_client: AsyncClient,
    test_app: FastAPI,
    db_session: AsyncSession,
    db_superuser: User,
    setup_product_graph: ProductGraph,
) -> None:
    """Photo URLs in the CSV resolve against the public API origin."""
    product_id, component_id = setup_product_graph.product.id, setup_product_graph.component.id
    with override_authenticated_user(test_app, db_superuser, superuser=True):
        upload = await api_client.post(
            f"/v1/components/{component_id}/images", files={"file": ("image.gif", GIF_BYTES, "image/gif")}
        )
    assert upload.status_code == status.HTTP_201_CREATED, upload.text
    # The test shares one session across requests; a real request starts with a fresh one.
    db_session.expire_all()

    response = await api_client.get(f"/v1/products/{product_id}/export")

    _, rows = _csv_rows(response.text)
    component_row = next(row for row in rows if row["id"] == str(component_id))
    image_url = component_row["image_urls"]
    assert image_url.startswith(str(settings.api_public_url).rstrip("/") + "/uploads/images/")
    assert image_url.endswith(upload.json()["image_url"])
