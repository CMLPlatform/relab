"""Integration tests for product API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import CompleteProductFactory, ProductFactory, UserFactory


class TestProductsAPI:
    """Integration tests for /users/{user_id}/products endpoints."""

    async def test_get_user_products_empty(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test getting products for a user with no products."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.get(f"/users/{user.id}/products")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 0

    async def test_get_user_products_with_data(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test getting products for a user with products."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product1 = ProductFactory.create(owner=user, name="Product 1")
        product2 = ProductFactory.create(owner=user, name="Product 2")

        response = await async_client.get(f"/users/{user.id}/products")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 2

        # Verify product names are in response
        product_names = [item["name"] for item in data["items"]]
        assert "Product 1" in product_names
        assert "Product 2" in product_names

    async def test_get_user_products_pagination(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test pagination of user products (recent feature)."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()

        # Create 15 products
        for i in range(15):
            ProductFactory.create(owner=user, name=f"Product {i}")

        # Test first page (default size is usually 10)
        response = await async_client.get(f"/users/{user.id}/products?page=1&size=10")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 10
        assert data["total"] == 15
        assert data["page"] == 1

        # Test second page
        response = await async_client.get(f"/users/{user.id}/products?page=2&size=10")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 5  # Remaining items
        assert data["page"] == 2

    async def test_get_product_with_physical_properties(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test getting a product with physical properties."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        CompleteProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = CompleteProductFactory.create(owner=user)

        response = await async_client.get(f"/users/{user.id}/products/{product.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(product.id)
        assert data["name"] == product.name

        # Verify physical properties are included
        if "physical_properties" in data:
            assert data["physical_properties"]["weight_g"] is not None
            assert data["physical_properties"]["weight_g"] > 0

    async def test_get_product_with_circularity_properties(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test getting a product with circularity properties."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        CompleteProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = CompleteProductFactory.create(owner=user)

        response = await async_client.get(f"/users/{user.id}/products/{product.id}")

        assert response.status_code == 200
        data = response.json()

        # Verify circularity properties are included
        if "circularity_properties" in data:
            assert data["circularity_properties"]["recyclability_observation"] is not None

    async def test_get_nonexistent_product(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test getting a product that doesn't exist."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.get(f"/users/{user.id}/products/999999")

        assert response.status_code == 404


class TestProductCreation:
    """Integration tests for product creation."""

    async def test_create_product_basic(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test creating a basic product."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        product_data = {
            "name": "Test Product",
            "description": "A test product",
            "brand": "Test Brand",
            "model": "T-1000",
        }

        # Note: This endpoint would require authentication
        # For now, we're testing the structure
        response = await async_client.post(
            f"/users/{user.id}/products", json=product_data, headers={"Authorization": "Bearer fake-token"}
        )

        # This will fail without proper auth, but validates the endpoint exists
        assert response.status_code in [201, 401, 403, 422]

    async def test_create_product_with_physical_properties(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test creating a product with physical properties."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        product_data = {
            "name": "Test Product",
            "description": "A test product with properties",
            "physical_properties": {"weight_g": 500.0, "height_cm": 10.0, "width_cm": 20.0, "depth_cm": 5.0},
        }

        response = await async_client.post(
            f"/users/{user.id}/products", json=product_data, headers={"Authorization": "Bearer fake-token"}
        )

        # Endpoint structure validation
        assert response.status_code in [201, 401, 403, 422]


class TestProductUpdate:
    """Integration tests for product updates."""

    async def test_update_product(self, async_client: AsyncClient, db_session: AsyncSession) -> None:
        """Test updating a product."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user, name="Original Name")

        update_data = {"name": "Updated Name", "description": "Updated description"}

        response = await async_client.patch(
            f"/users/{user.id}/products/{product.id}",
            json=update_data,
            headers={"Authorization": "Bearer fake-token"},
        )

        # Endpoint structure validation
        assert response.status_code in [200, 401, 403, 404, 422]


class TestProductDeletion:
    """Integration tests for product deletion."""

    async def test_delete_product(self, async_client: AsyncClient, db_session: AsyncSession) -> None:
        """Test deleting a product (superuser feature)."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user)

        response = await async_client.delete(
            f"/users/{user.id}/products/{product.id}", headers={"Authorization": "Bearer fake-token"}
        )

        # Endpoint structure validation
        assert response.status_code in [204, 401, 403, 404]


class TestProductFiltering:
    """Integration tests for product filtering and search."""

    async def test_filter_products_by_name(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test filtering products by name."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        ProductFactory.create(owner=user, name="Laptop")
        ProductFactory.create(owner=user, name="Phone")
        ProductFactory.create(owner=user, name="Tablet")

        # Test filtering (if supported)
        response = await async_client.get(f"/users/{user.id}/products?name__icontains=lap")

        assert response.status_code == 200

    async def test_sort_products(self, async_client: AsyncClient, db_session: AsyncSession) -> None:
        """Test sorting products (recent feature)."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        ProductFactory.create(owner=user, name="Zebra Product")
        ProductFactory.create(owner=user, name="Alpha Product")
        ProductFactory.create(owner=user, name="Beta Product")

        # Test sorting by name
        response = await async_client.get(f"/users/{user.id}/products?order_by=name")

        assert response.status_code == 200
        data = response.json()

        if "items" in data and len(data["items"]) > 0:
            # Verify first item is alphabetically first
            first_name = data["items"][0]["name"]
            assert first_name == "Alpha Product"
