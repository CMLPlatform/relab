"""Integration tests for data collection endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from fastapi import status
from sqlmodel import select

from app.api.data_collection.models import Product
from tests.factories.models import MaterialFactory, ProductFactory, ProductTypeFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.api.auth.models import User

# Constants for test values
PRODUCT_BASE_NAME = "Test Product Base"
BRAND_X = "Brand X"
START_TIME = datetime(2020, 1, 1, tzinfo=UTC)
END_TIME = datetime(2020, 1, 2, tzinfo=UTC)
COMPONENT_NAME = "Test Component"
NEW_PRODUCT_NAME = "New API Product"
PRODUCT_DESC = "Via API"
WEIGHT_1000 = 1000.0
WEIGHT_500 = 500.0
HEIGHT_10 = 10.0
RECYCLABILITY_GOOD = "Good"
RECYCLABILITY_TEST = "Test"
UPDATED_PRODUCT_NAME = "Updated API Product"
NEW_COMPONENT_NAME = "New API Component"
COMPONENT_AMOUNT = 2
BOM_QUANTITY = 10.0
BOM_UNIT = "g"


@pytest.fixture
async def setup_product(session: AsyncSession, superuser: User) -> Product:
    """Fixture to set up a product for testing."""
    # Ensure there is a product type
    pt = await ProductTypeFactory.create_async(session=session)
    # Create an initial product owned by the superuser
    return await ProductFactory.create_async(
        session=session,
        owner_id=superuser.id,
        product_type_id=pt.id,
        name=PRODUCT_BASE_NAME,
        brand=BRAND_X,
        dismantling_time_start=START_TIME,
        dismantling_time_end=END_TIME,
    )


@pytest.fixture
async def setup_component(session: AsyncSession, setup_product: Product, superuser: User) -> Product:
    """Fixture to set up a component for testing."""
    pt = await ProductTypeFactory.create_async(session=session)
    return await ProductFactory.create_async(
        session=session,
        owner_id=superuser.id,
        parent_id=setup_product.id,
        product_type_id=pt.id,
        name=COMPONENT_NAME,
        dismantling_time_start=START_TIME,
        dismantling_time_end=END_TIME,
    )


class TestDataCollectionEndpoints:
    """Tests for data collection API endpoints."""

    async def test_get_products(self, async_client: AsyncClient, session: AsyncSession, superuser: User) -> None:
        """Test GET /products retrieves products."""
        # Create product using factory
        pt = await ProductTypeFactory.create_async(session=session)
        product = await ProductFactory.create_async(
            session=session,
            owner_id=superuser.id,
            product_type_id=pt.id,
            name=PRODUCT_BASE_NAME,
            brand=BRAND_X,
            dismantling_time_start=START_TIME,
            dismantling_time_end=END_TIME,
        )

        # Verify product was created in session
        stmt = select(Product).where(Product.id == product.id)
        result = await session.exec(stmt)
        assert result.first() is not None

        response = await async_client.get("/products")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["items"]
        assert len(data["items"]) >= 1
        assert data["items"][0]["name"] == PRODUCT_BASE_NAME

    async def test_get_products_tree(
        self, async_client: AsyncClient, session: AsyncSession, setup_product: Product
    ) -> None:
        """Test GET /products/tree retrieves product hierarchy."""
        # Verify product exists in session

        stmt = select(Product).where(Product.id == setup_product.id)
        result = await session.exec(stmt)
        assert result.first() is not None

        response = await async_client.get("/products/tree?recursion_depth=1")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # Verify response is a list with expected structure
        assert isinstance(data, list)
        # If we have products, verify our product is in the tree
        if data:
            tree_product = next((p for p in data if p["id"] == setup_product.id), None)
            assert tree_product is not None
            assert tree_product["name"] == PRODUCT_BASE_NAME

    async def test_get_product_by_id(self, async_client: AsyncClient, setup_product: Product) -> None:
        """Test GET /products/{id} retrieves a product by ID."""
        response = await async_client.get(f"/products/{setup_product.id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == PRODUCT_BASE_NAME
        assert data["id"] == setup_product.id

    async def test_create_product(self, superuser_client: AsyncClient, session: AsyncSession) -> None:
        """Test POST /products creates a new product."""
        pt = await ProductTypeFactory.create_async(session=session)
        material = await MaterialFactory.create_async(session=session)
        payload = {
            "name": NEW_PRODUCT_NAME,
            "description": PRODUCT_DESC,
            "product_type_id": pt.id,
            "physical_properties": {
                "weight_g": WEIGHT_500,
                "height_cm": HEIGHT_10,
            },
            "circularity_properties": {"recyclability_observation": RECYCLABILITY_GOOD},
            "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
        }

        response = await superuser_client.post("/products", json=payload)
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == NEW_PRODUCT_NAME
        assert "id" in data  # noqa: PLR2004

    async def test_update_product(self, superuser_client: AsyncClient, setup_product: Product) -> None:
        """Test PATCH /products/{id} updates a product."""
        payload = {"name": UPDATED_PRODUCT_NAME}
        response = await superuser_client.patch(f"/products/{setup_product.id}", json=payload)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == UPDATED_PRODUCT_NAME

    async def test_get_product_components(
        self, async_client: AsyncClient, setup_product: Product, setup_component: Product
    ) -> None:
        """Test GET /products/{id}/components retrieves hierarchy."""
        del setup_component
        response = await async_client.get(f"/products/{setup_product.id}/components")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 1
        assert data[0]["name"] == COMPONENT_NAME

    async def test_get_product_component_by_id(
        self, async_client: AsyncClient, setup_product: Product, setup_component: Product
    ) -> None:
        """Test GET /products/{pid}/components/{cid} retrieves a component."""
        response = await async_client.get(f"/products/{setup_product.id}/components/{setup_component.id}")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == setup_component.id

    async def test_add_component_to_product(
        self, superuser_client: AsyncClient, session: AsyncSession, setup_product: Product
    ) -> None:
        """Test POST /products/{id}/components adds a new component."""
        material = await MaterialFactory.create_async(session=session)
        payload = {
            "name": NEW_COMPONENT_NAME,
            "amount_in_parent": COMPONENT_AMOUNT,
            "bill_of_materials": [{"material_id": material.id, "quantity": BOM_QUANTITY, "unit": BOM_UNIT}],
        }
        response = await superuser_client.post(f"/products/{setup_product.id}/components", json=payload)
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == NEW_COMPONENT_NAME

    async def test_delete_product_component(
        self, superuser_client: AsyncClient, setup_product: Product, setup_component: Product
    ) -> None:
        """Test DELETE /products/{pid}/components/{cid} removes a component."""
        response = await superuser_client.delete(f"/products/{setup_product.id}/components/{setup_component.id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

    async def test_delete_product(self, superuser_client: AsyncClient, setup_product: Product) -> None:
        """Test DELETE /products/{id} removes a product."""
        response = await superuser_client.delete(f"/products/{setup_product.id}")
        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify it's deleted
        response = await superuser_client.get(f"/products/{setup_product.id}")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_user_products_redirect(self, superuser_client: AsyncClient, superuser: User) -> None:
        """Test GET /users/me/products retrieves user's products."""
        del superuser
        # Redirect route uses HTTP GET
        response = await superuser_client.get("/users/me/products")
        # follow_redirects=True is set on async_client so we get the target route
        assert response.status_code == status.HTTP_200_OK

    async def test_get_brands(self, async_client: AsyncClient, setup_product: Product) -> None:
        """Test GET /brands retrieves list of unique brands."""
        del setup_product
        response = await async_client.get("/brands")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert BRAND_X in data

    async def test_create_and_get_physical_properties(
        self, superuser_client: AsyncClient, setup_product: Product
    ) -> None:
        """Test POST and GET physical properties for a product."""
        payload = {"weight_g": WEIGHT_1000}
        response = await superuser_client.post(f"/products/{setup_product.id}/physical_properties", json=payload)
        assert response.status_code == status.HTTP_201_CREATED

        response = await superuser_client.get(f"/products/{setup_product.id}/physical_properties")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["weight_g"] == WEIGHT_1000

    async def test_create_and_get_circularity_properties(
        self, superuser_client: AsyncClient, setup_product: Product
    ) -> None:
        """Test POST and GET circularity properties for a product."""
        payload = {"recyclability_observation": RECYCLABILITY_TEST}
        response = await superuser_client.post(f"/products/{setup_product.id}/circularity_properties", json=payload)
        assert response.status_code == status.HTTP_201_CREATED

        response = await superuser_client.get(f"/products/{setup_product.id}/circularity_properties")
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["recyclability_observation"] == RECYCLABILITY_TEST
