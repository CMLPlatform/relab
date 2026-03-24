"""API endpoint tests for background data (E2E tests)."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from dirty_equals import IsInt, IsPositive, IsStr
from fastapi import status

from app.api.background_data.models import TaxonomyDomain
from tests.factories.models import TaxonomyFactory

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.api.background_data.models import Category, Taxonomy

# Constants for test values
TAXONOMY_NAME = "Test API Taxonomy"
TAXONOMY_VERSION = "v1.0.0"
TAXONOMY_DESC = "Created via API"
TAXONOMY_DOMAIN_VAL = "materials"
UPDATED_TAXONOMY_NAME = "Updated Taxonomy Name"
UPDATED_TAXONOMY_VERSION = "v2.0.0"
CATEGORY_NAME = "Test API Category"
CATEGORY_DESC = "Created via API"
PARENT_CATEGORY = "Parent Category"
CHILD_CATEGORY = "Child Category"
GRANDCHILD_CATEGORY = "Grandchild Category"
MATERIAL_NAME = "Test API Material"
MATERIAL_DESC = "Created via API"
MATERIAL_DENSITY = 8000.0
INVALID_MATERIAL = "Invalid Material"
INVALID_DENSITY = -100.0
PRODUCT_TYPE_NAME = "Test API Product Type"
PRODUCT_TYPE_DESC = "Created via API"
NONEXISTENT_ID = "99999"


@pytest.mark.api
class TestTaxonomyAPI:
    """Test Taxonomy API endpoints."""

    async def test_create_taxonomy(self, superuser_client: AsyncClient) -> None:
        """Test POST /admin/taxonomies creates a taxonomy."""
        data = {
            "name": TAXONOMY_NAME,
            "version": TAXONOMY_VERSION,
            "description": TAXONOMY_DESC,
            "domains": [TAXONOMY_DOMAIN_VAL],
        }

        response = await superuser_client.post("/admin/taxonomies", json=data)

        assert response.status_code == status.HTTP_201_CREATED
        json_data = response.json()
        assert json_data["name"] == TAXONOMY_NAME
        assert json_data["version"] == TAXONOMY_VERSION
        assert "id" in json_data
        assert "created_at" in json_data

    async def test_get_taxonomy(self, async_client: AsyncClient, db_taxonomy: Taxonomy) -> None:
        """Test GET /taxonomies/{id} retrieves a taxonomy."""
        response = await async_client.get(f"/taxonomies/{db_taxonomy.id}")

        assert response.status_code == status.HTTP_200_OK
        json_data = response.json()
        assert json_data["id"] == db_taxonomy.id
        assert json_data["name"] == db_taxonomy.name

    async def test_get_nonexistent_taxonomy(self, async_client: AsyncClient) -> None:
        """Test GET /taxonomies/{id} with non-existent ID returns 404."""
        response = await async_client.get(f"/taxonomies/{NONEXISTENT_ID}")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    async def test_list_taxonomies(self, async_client: AsyncClient, session: AsyncSession) -> None:
        """Test GET /taxonomies returns list of taxonomies."""
        # Create a few taxonomies
        for i in range(3):
            await TaxonomyFactory.create_async(
                session,
                name=f"Taxonomy {i}",
                version=f"v{i}.0.0",
                domains={TaxonomyDomain.MATERIALS},
            )

        response = await async_client.get("/taxonomies")

        assert response.status_code == status.HTTP_200_OK
        json_data = response.json()
        assert "items" in json_data
        assert len(json_data["items"]) >= 3

    async def test_update_taxonomy(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy) -> None:
        """Test PATCH /admin/taxonomies/{id} updates a taxonomy."""
        update_data = {
            "name": UPDATED_TAXONOMY_NAME,
            "version": UPDATED_TAXONOMY_VERSION,
        }

        response = await superuser_client.patch(f"/admin/taxonomies/{db_taxonomy.id}", json=update_data)

        assert response.status_code == status.HTTP_200_OK
        json_data = response.json()
        assert json_data["name"] == UPDATED_TAXONOMY_NAME
        assert json_data["version"] == UPDATED_TAXONOMY_VERSION

    async def test_delete_taxonomy(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy) -> None:
        """Test DELETE /admin/taxonomies/{id} deletes a taxonomy."""
        response = await superuser_client.delete(f"/admin/taxonomies/{db_taxonomy.id}")

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Verify it's deleted
        get_response = await superuser_client.get(f"/taxonomies/{db_taxonomy.id}")
        assert get_response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.api
class TestCategoryAPI:
    """Test Category API endpoints."""

    async def test_create_category(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy) -> None:
        """Test POST /admin/categories creates a category."""
        data = {
            "name": CATEGORY_NAME,
            "description": CATEGORY_DESC,
            "taxonomy_id": db_taxonomy.id,
        }

        response = await superuser_client.post("/admin/categories", json=data)

        assert response.status_code == status.HTTP_201_CREATED
        json_data = response.json()
        assert json_data["name"] == CATEGORY_NAME
        assert json_data["taxonomy_id"] == db_taxonomy.id

    async def test_get_category(self, async_client: AsyncClient, db_category: Category) -> None:
        """Test GET /categories/{id} retrieves a category."""
        response = await async_client.get(f"/categories/{db_category.id}")

        assert response.status_code == status.HTTP_200_OK
        json_data = response.json()
        assert json_data["id"] == db_category.id
        assert json_data["name"] == db_category.name

    async def test_create_category_with_subcategories(
        self, superuser_client: AsyncClient, db_taxonomy: Taxonomy
    ) -> None:
        """Test creating category with nested subcategories."""
        data = {
            "name": PARENT_CATEGORY,
            "taxonomy_id": db_taxonomy.id,
            "subcategories": [{"name": CHILD_CATEGORY, "subcategories": [{"name": GRANDCHILD_CATEGORY}]}],
        }

        response = await superuser_client.post("/admin/categories", json=data)

        assert response.status_code == status.HTTP_201_CREATED
        json_data = response.json()
        assert json_data["name"] == PARENT_CATEGORY


@pytest.mark.api
class TestMaterialAPI:
    """Test Material API endpoints."""

    async def test_create_material(self, superuser_client: AsyncClient) -> None:
        """Test POST /admin/materials creates a material."""
        data = {
            "name": MATERIAL_NAME,
            "description": MATERIAL_DESC,
            "density_kg_m3": MATERIAL_DENSITY,
            "is_crm": True,
        }

        response = await superuser_client.post("/admin/materials", json=data)

        assert response.status_code == status.HTTP_201_CREATED
        json_data = response.json()
        assert json_data["name"] == MATERIAL_NAME
        assert json_data["density_kg_m3"] == MATERIAL_DENSITY

    async def test_create_material_with_invalid_density(self, superuser_client: AsyncClient) -> None:
        """Test POST /admin/materials with negative density fails."""
        data = {
            "name": INVALID_MATERIAL,
            "density_kg_m3": INVALID_DENSITY,
        }

        response = await superuser_client.post("/admin/materials", json=data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.api
class TestProductTypeAPI:
    """Test ProductType API endpoints."""

    async def test_create_product_type(self, superuser_client: AsyncClient) -> None:
        """Test POST /admin/product-types creates a product type."""
        data = {
            "name": PRODUCT_TYPE_NAME,
            "description": PRODUCT_TYPE_DESC,
        }

        response = await superuser_client.post("/admin/product-types", json=data)

        assert response.status_code == status.HTTP_201_CREATED
        json_data = response.json()
        assert json_data["name"] == PRODUCT_TYPE_NAME


@pytest.mark.api
@pytest.mark.slow
class TestAPIWithDirtyEquals:
    """Example tests using dirty-equals for flexible assertions."""

    async def test_taxonomy_response_structure(self, async_client: AsyncClient, db_taxonomy: Taxonomy) -> None:
        """Test taxonomy response has expected structure using dirty-equals."""
        response = await async_client.get(f"/taxonomies/{db_taxonomy.id}")

        assert response.status_code == status.HTTP_200_OK
        json_data = response.json()

        # Use dirty-equals for flexible type checking
        assert json_data == {
            "id": IsInt & IsPositive,
            "name": IsStr,
            "version": IsStr | None,
            "description": IsStr | None,
            "domains": [TAXONOMY_DOMAIN_VAL],
            "source": IsStr | None,
            "created_at": IsStr,
            "updated_at": IsStr,
        }


@pytest.mark.api
class TestUnitsAPI:
    """Test Units API endpoints."""

    async def test_get_units(self, async_client: AsyncClient) -> None:
        """Test GET /units retrieves available units."""
        response = await async_client.get("/units")
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert "kg" in data or "g" in data
