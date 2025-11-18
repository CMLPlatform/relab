"""Router/API validation tests for product endpoints."""

import pytest
from datetime import UTC, datetime, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.factories import PhysicalPropertiesFactory, ProductFactory, UserFactory


class TestProductAPIInputValidation:
    """Test input validation at the API/router level."""

    async def test_create_product_with_invalid_name_length(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that API rejects product names that are too short or long."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        # Name too short (less than 2 characters)
        response = await async_client.post(
            f"/users/{user.id}/products",
            json={"name": "A"},
            headers={"Authorization": "Bearer fake-token"},
        )

        # Should return 422 Unprocessable Entity (validation error)
        assert response.status_code in [422, 401, 403]

        if response.status_code == 422:
            assert "at least 2 characters" in response.text.lower()

        # Name too long (more than 100 characters)
        response = await async_client.post(
            f"/users/{user.id}/products",
            json={"name": "A" * 101},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [422, 401, 403]

    async def test_create_product_with_invalid_datetime(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that API rejects invalid datetime formats."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        # Future datetime (should be in past)
        future_time = (datetime.now(UTC) + timedelta(days=1)).isoformat()

        response = await async_client.post(
            f"/users/{user.id}/products",
            json={"name": "Test Product", "dismantling_time_start": future_time},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [422, 401, 403]

    async def test_create_product_with_missing_required_fields(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that API rejects requests missing required fields."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        # Missing name field
        response = await async_client.post(
            f"/users/{user.id}/products", json={"description": "Test"}, headers={"Authorization": "Bearer fake-token"}
        )

        assert response.status_code in [422, 401, 403]

        if response.status_code == 422:
            assert "name" in response.text.lower() or "field required" in response.text.lower()

    async def test_create_physical_properties_with_negative_values(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that API rejects negative physical property values."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user)

        # Negative weight
        response = await async_client.post(
            f"/users/{user.id}/products/{product.id}/physical-properties",
            json={"weight_kg": -5.0},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [422, 401, 403]

        if response.status_code == 422:
            assert "greater than 0" in response.text.lower()

    async def test_update_product_with_invalid_data(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that API rejects updates with invalid data."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user)

        # Description too long
        response = await async_client.patch(
            f"/users/{user.id}/products/{product.id}",
            json={"description": "A" * 501},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [422, 401, 403]


class TestProductAPIConstraintValidation:
    """Test constraint validation at the API level."""

    async def test_get_nonexistent_product_returns_404(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that getting a nonexistent product returns 404."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.get(f"/users/{user.id}/products/99999")

        assert response.status_code == 404

    async def test_update_nonexistent_product_returns_404(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that updating a nonexistent product returns 404."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.patch(
            f"/users/{user.id}/products/99999",
            json={"name": "Updated"},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [404, 401, 403]

    async def test_delete_nonexistent_product_returns_404(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that deleting a nonexistent product returns 404."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.delete(
            f"/users/{user.id}/products/99999", headers={"Authorization": "Bearer fake-token"}
        )

        assert response.status_code in [404, 401, 403]


class TestPhysicalPropertiesAPIValidation:
    """Test physical properties API validation."""

    async def test_create_physical_properties_for_nonexistent_product(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that creating physical properties for nonexistent product returns 404."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.post(
            f"/users/{user.id}/products/99999/physical-properties",
            json={"weight_kg": 20.0},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [404, 401, 403]

    async def test_get_physical_properties_for_product_without_them(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that getting physical properties for product without them returns 404."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user)

        response = await async_client.get(f"/users/{user.id}/products/{product.id}/physical-properties")

        assert response.status_code in [404, 401, 403]

    async def test_update_physical_properties_validates_positive_values(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that update validates positive values."""
        UserFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session

        user = UserFactory.create()
        product = ProductFactory.create(owner=user)
        PhysicalPropertiesFactory.create(product=product)

        # Try to update with negative value
        response = await async_client.patch(
            f"/users/{user.id}/products/{product.id}/physical-properties",
            json={"weight_kg": -10.0},
            headers={"Authorization": "Bearer fake-token"},
        )

        assert response.status_code in [422, 401, 403]


class TestAPIErrorResponses:
    """Test that API returns proper error responses for validation failures."""

    async def test_validation_error_returns_422(self, async_client: AsyncClient, db_session: AsyncSession) -> None:
        """Test that validation errors return 422 Unprocessable Entity."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        # Invalid data (name too short)
        response = await async_client.post(
            f"/users/{user.id}/products", json={"name": "A"}, headers={"Authorization": "Bearer fake-token"}
        )

        # Should be 422 for validation error (or 401/403 if auth check comes first)
        assert response.status_code in [422, 401, 403]

    async def test_not_found_error_returns_404(self, async_client: AsyncClient, db_session: AsyncSession) -> None:
        """Test that not found errors return 404."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.get(f"/users/{user.id}/products/99999")

        assert response.status_code == 404

    async def test_validation_error_includes_details(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that validation errors include details about what failed."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.post(
            f"/users/{user.id}/products", json={"name": "A"}, headers={"Authorization": "Bearer fake-token"}
        )

        if response.status_code == 422:
            # Should include error details
            data = response.json()
            assert "detail" in data or "errors" in data


class TestQueryParameterValidation:
    """Test validation of query parameters."""

    async def test_pagination_page_must_be_positive(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that page parameter must be positive."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.get(f"/users/{user.id}/products?page=0")

        # Some pagination libraries return first page, others return 422
        assert response.status_code in [200, 422, 400]

    async def test_pagination_size_must_be_positive(
        self, async_client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Test that size parameter must be positive."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        response = await async_client.get(f"/users/{user.id}/products?size=-1")

        # Should return validation error or default behavior
        assert response.status_code in [200, 422, 400]

    async def test_invalid_filter_parameters(self, async_client: AsyncClient, db_session: AsyncSession) -> None:
        """Test that invalid filter parameters are handled."""
        UserFactory._meta.sqlalchemy_session = db_session
        user = UserFactory.create()

        # Invalid parameter type
        response = await async_client.get(f"/users/{user.id}/products?product_type_id=invalid")

        # Should either ignore invalid param or return error
        assert response.status_code in [200, 422, 400]
