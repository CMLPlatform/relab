"""API endpoint tests for background data (E2E tests)."""

import pytest
from dirty_equals import IsInt, IsList, IsPositive, IsStr
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.background_data.models import Category, Taxonomy, TaxonomyDomain


@pytest.mark.api
class TestTaxonomyAPI:
    """Test Taxonomy API endpoints."""

    async def test_create_taxonomy(self, superuser_client: AsyncClient):
        """Test POST /admin/taxonomies creates a taxonomy."""
        data = {
            "name": "Test API Taxonomy",
            "version": "v1.0.0",
            "description": "Created via API",
            "domains": ["materials"],
        }

        response = await superuser_client.post("/admin/taxonomies", json=data)

        if response.status_code != 201:
            print(f"\nResponse status: {response.status_code}")
            print(f"Response Content: {response.text}")
        assert response.status_code == 201
        json_data = response.json()
        assert json_data["name"] == "Test API Taxonomy"
        assert json_data["version"] == "v1.0.0"
        assert "id" in json_data
        assert "created_at" in json_data

    async def test_get_taxonomy(self, async_client: AsyncClient, db_taxonomy: Taxonomy):
        """Test GET /taxonomies/{id} retrieves a taxonomy."""
        response = await async_client.get(f"/taxonomies/{db_taxonomy.id}")

        assert response.status_code == 200
        json_data = response.json()
        assert json_data["id"] == db_taxonomy.id
        assert json_data["name"] == db_taxonomy.name

    async def test_get_nonexistent_taxonomy(self, async_client: AsyncClient):
        """Test GET /taxonomies/{id} with non-existent ID returns 404."""
        response = await async_client.get("/taxonomies/99999")
        assert response.status_code == 404

    async def test_list_taxonomies(self, async_client: AsyncClient, session: AsyncSession):
        """Test GET /taxonomies returns list of taxonomies."""
        # Create a few taxonomies
        for i in range(3):
            taxonomy = Taxonomy(
                name=f"Taxonomy {i}",
                version=f"v{i}.0.0",
                domains={TaxonomyDomain.MATERIALS},
            )
            session.add(taxonomy)
        await session.flush()

        response = await async_client.get("/taxonomies")

        assert response.status_code == 200
        json_data = response.json()
        assert isinstance(json_data, list)
        assert len(json_data) >= 3

    async def test_update_taxonomy(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy):
        """Test PATCH /admin/taxonomies/{id} updates a taxonomy."""
        update_data = {
            "name": "Updated Taxonomy Name",
            "version": "v2.0.0",
        }

        response = await superuser_client.patch(f"/admin/taxonomies/{db_taxonomy.id}", json=update_data)

        if response.status_code != 200:
            print(f"DEBUG: {response.json()}")
        assert response.status_code == 200
        json_data = response.json()
        assert json_data["name"] == "Updated Taxonomy Name"
        assert json_data["version"] == "v2.0.0"

    async def test_delete_taxonomy(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy):
        """Test DELETE /admin/taxonomies/{id} deletes a taxonomy."""
        response = await superuser_client.delete(f"/admin/taxonomies/{db_taxonomy.id}")

        assert response.status_code == 204

        # Verify it's deleted
        get_response = await superuser_client.get(f"/taxonomies/{db_taxonomy.id}")
        assert get_response.status_code == 404


@pytest.mark.api
class TestCategoryAPI:
    """Test Category API endpoints."""

    async def test_create_category(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy):
        """Test POST /admin/categories creates a category."""
        data = {
            "name": "Test API Category",
            "description": "Created via API",
            "taxonomy_id": db_taxonomy.id,
        }

        response = await superuser_client.post("/admin/categories", json=data)

        assert response.status_code == 201
        json_data = response.json()
        assert json_data["name"] == "Test API Category"
        assert json_data["taxonomy_id"] == db_taxonomy.id

    async def test_get_category(self, async_client: AsyncClient, db_category: Category):
        """Test GET /categories/{id} retrieves a category."""
        response = await async_client.get(f"/categories/{db_category.id}")

        assert response.status_code == 200
        json_data = response.json()
        assert json_data["id"] == db_category.id
        assert json_data["name"] == db_category.name

    async def test_create_category_with_subcategories(self, superuser_client: AsyncClient, db_taxonomy: Taxonomy):
        """Test creating category with nested subcategories."""
        data = {
            "name": "Parent Category",
            "taxonomy_id": db_taxonomy.id,
            "subcategories": [{"name": "Child Category", "subcategories": [{"name": "Grandchild Category"}]}],
        }

        response = await superuser_client.post("/admin/categories", json=data)

        if response.status_code != 201:
            print(f"DEBUG: {response.json()}")
        assert response.status_code == 201
        json_data = response.json()
        assert json_data["name"] == "Parent Category"
        # Verify subcategories were created (depending on endpoint response structure)


@pytest.mark.api
class TestMaterialAPI:
    """Test Material API endpoints."""

    async def test_create_material(self, superuser_client: AsyncClient):
        """Test POST /admin/materials creates a material."""
        data = {
            "name": "Test API Material",
            "description": "Created via API",
            "density_kg_m3": 8000.0,
            "is_crm": True,
        }

        response = await superuser_client.post("/admin/materials", json=data)

        assert response.status_code == 201
        json_data = response.json()
        assert json_data["name"] == "Test API Material"
        assert json_data["density_kg_m3"] == 8000.0

    async def test_create_material_with_invalid_density(self, superuser_client: AsyncClient):
        """Test POST /admin/materials with negative density fails."""
        data = {
            "name": "Invalid Material",
            "density_kg_m3": -100.0,
        }

        response = await superuser_client.post("/admin/materials", json=data)
        assert response.status_code == 422  # Validation error


@pytest.mark.api
class TestProductTypeAPI:
    """Test ProductType API endpoints."""

    async def test_create_product_type(self, superuser_client: AsyncClient):
        """Test POST /admin/product-types creates a product type."""
        data = {
            "name": "Test API Product Type",
            "description": "Created via API",
        }

        response = await superuser_client.post("/admin/product-types", json=data)

        assert response.status_code == 201
        json_data = response.json()
        assert json_data["name"] == "Test API Product Type"


@pytest.mark.api
@pytest.mark.slow
class TestAPIWithDirtyEquals:
    """Example tests using dirty-equals for flexible assertions."""

    async def test_taxonomy_response_structure(self, async_client: AsyncClient, db_taxonomy: Taxonomy):
        """Test taxonomy response has expected structure using dirty-equals."""
        response = await async_client.get(f"/taxonomies/{db_taxonomy.id}")

        assert response.status_code == 200
        json_data = response.json()

        # Use dirty-equals for flexible type checking
        assert json_data == {
            "id": IsInt & IsPositive,
            "name": IsStr,
            "version": IsStr | None,
            "description": IsStr | None,
            "domains": ["materials"],
            "source": IsStr | None,
            "created_at": IsStr,
            "updated_at": IsStr,
        }
