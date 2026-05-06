"""Integration tests for OpenAPI schema generation endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI, status
from httpx import ASGITransport, AsyncClient

from app.api.common.routers.openapi import init_openapi_docs
from app.core.config import settings
from app.core.config.models import Environment
from app.main import create_app

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


def assert_paths_present(paths: dict[str, object], expected_paths: set[str]) -> None:
    """Assert that all expected paths are present in an OpenAPI paths object."""
    assert expected_paths <= paths.keys()


@pytest.fixture
async def openapi_client(test_app: FastAPI) -> AsyncGenerator[AsyncClient]:
    """Provide a minimal client for schema tests without full runtime startup."""
    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test",
        follow_redirects=True,
    ) as client:
        yield client


class TestOpenAPIEndpoints:
    """Tests for canonical and filtered OpenAPI schema generation."""

    async def test_openapi_registration_can_exclude_internal_contracts_explicitly(self) -> None:
        """OpenAPI route registration should not read global environment state."""
        app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
        init_openapi_docs(app, include_internal_contracts=False)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
            public_schema = await client.get("/openapi.public.json")
            device_schema = await client.get("/openapi.device.json")
            canonical_schema = await client.get("/openapi.json")
            admin_schema = await client.get("/openapi.admin.json")

        assert public_schema.status_code == status.HTTP_200_OK
        assert device_schema.status_code == status.HTTP_200_OK
        assert canonical_schema.status_code == status.HTTP_404_NOT_FOUND
        assert admin_schema.status_code == status.HTTP_404_NOT_FOUND

    async def test_openapi_registration_can_include_internal_contracts_explicitly(self) -> None:
        """Development/testing callers should be able to opt into full/admin contracts."""
        app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
        init_openapi_docs(app, include_internal_contracts=True)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
            canonical_schema = await client.get("/openapi.json")
            admin_schema = await client.get("/openapi.admin.json")

        assert canonical_schema.status_code == status.HTTP_200_OK
        assert admin_schema.status_code == status.HTTP_200_OK

    async def test_canonical_openapi_json_can_be_generated(self, openapi_client: AsyncClient) -> None:
        """The canonical OpenAPI schema endpoint should return the complete API contract."""
        response = await openapi_client.get("/openapi.json")

        assert response.status_code == status.HTTP_200_OK
        assert "cache-control" not in response.headers
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert isinstance(payload["paths"], dict)
        assert payload["paths"]
        assert "x-tagGroups" in payload
        assert payload["info"]["version"] == "1.0.0"
        assert payload["info"]["x-api-major"] == "v1"
        assert "x-service-version" in payload["info"]
        paths = payload["paths"]
        assert "/v1/organizations" not in paths
        assert "/v1/admin/organizations" not in paths
        assert "/v1/users/me/organization" not in paths
        assert_paths_present(
            paths,
            {
                "/v1/auth/bearer/login",
                "/v1/admin/materials",
                "/v1/admin/categories",
                "/v1/admin/taxonomies",
                "/v1/admin/cache/clear/{namespace}",
                "/v1/admin/users",
                "/v1/products/suggestions/brands",
                "/v1/products/facets",
                "/v1/materials/{material_id}/categories",
                "/v1/materials/{material_id}/files",
                "/v1/materials/{material_id}/images",
                "/v1/product-types/{product_type_id}/categories",
                "/v1/product-types/{product_type_id}/files",
                "/v1/product-types/{product_type_id}/images",
                "/v1/oauth/google/session/authorize",
                "/v1/plugins/rpi-cam/cameras/{camera_id}/recording-stream",
                "/v1/plugins/rpi-cam/cameras/{camera_id}/recording-stream/monitor",
            },
        )

        categories_name_filter_param = next(
            parameter
            for parameter in payload["paths"]["/v1/categories"]["get"]["parameters"]
            if parameter["name"] == "name[ilike]"
        )
        assert categories_name_filter_param["schema"]["anyOf"][0]["type"] == "string"

        category_schema_examples = payload["components"]["schemas"]["CategoryRead"]["examples"]
        assert category_schema_examples[0]["taxonomy_id"] == 1

        rpi_include_status_param = next(
            parameter
            for parameter in payload["paths"]["/v1/plugins/rpi-cam/cameras"]["get"]["parameters"]
            if parameter["name"] == "include_status"
        )
        assert rpi_include_status_param["examples"]["enabled"]["value"] is True

        camera_create_examples = payload["components"]["schemas"]["CameraCreate"]["examples"]
        assert camera_create_examples[0]["name"] == "Workbench Camera"

        video_create_examples = payload["components"]["schemas"]["VideoCreateWithinProduct"]["examples"]
        assert video_create_examples[0]["video_metadata"]["source"] == "youtube"

        user_create_examples = payload["components"]["schemas"]["UserRegister"]["examples"]
        assert user_create_examples[0]["username"] == "username"

        refresh_response_examples = payload["components"]["schemas"]["RefreshTokenResponse"]["examples"]
        assert refresh_response_examples[0]["token_type"] == "bearer"

    async def test_public_openapi_json_filters_to_app_schema(self, openapi_client: AsyncClient) -> None:
        """The public OpenAPI schema should contain app-facing routes only."""
        response = await openapi_client.get("/openapi.public.json")

        assert response.status_code == status.HTTP_200_OK
        assert "cache-control" not in response.headers
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert isinstance(payload["paths"], dict)
        assert payload["paths"]
        assert payload["info"]["version"] == "1.0.0"
        assert payload["info"]["x-api-major"] == "v1"
        assert "/v1/auth/bearer/login" in payload["paths"]
        assert "/v1/products" in payload["paths"]
        assert "/v1/admin/materials" not in payload["paths"]
        assert "/v1/admin/categories" not in payload["paths"]
        assert "/v1/admin/taxonomies" not in payload["paths"]
        assert "/v1/admin/cache/clear/{namespace}" not in payload["paths"]
        assert "/v1/admin/users" not in payload["paths"]
        assert "/v1/admin/organizations" not in payload["paths"]
        assert "/v1/organizations" not in payload["paths"]
        assert "/v1/users/me/organization" not in payload["paths"]
        assert "/v1/newsletter/subscribe" not in payload["paths"]

    async def test_admin_openapi_json_filters_to_admin_schema(self, openapi_client: AsyncClient) -> None:
        """The admin OpenAPI schema should contain admin routes only."""
        response = await openapi_client.get("/openapi.admin.json")

        assert response.status_code == status.HTTP_200_OK
        assert "cache-control" not in response.headers
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert "/v1/admin/materials" in payload["paths"]
        assert "/v1/admin/users" in payload["paths"]
        assert "/v1/admin/users/by-email/{email}" not in payload["paths"]
        assert "/v1/admin/users/by-username/{username}" not in payload["paths"]
        assert "/v1/products" not in payload["paths"]
        assert "/v1/auth/bearer/login" not in payload["paths"]

        admin_users_email_filter_param = next(
            parameter
            for parameter in payload["paths"]["/v1/admin/users"]["get"]["parameters"]
            if parameter["name"] == "email[ilike]"
        )
        assert admin_users_email_filter_param["schema"]["anyOf"][0]["type"] == "string"

    async def test_device_openapi_json_filters_to_device_schema(self, openapi_client: AsyncClient) -> None:
        """The device OpenAPI schema should contain device-originated plugin routes."""
        response = await openapi_client.get("/openapi.device.json")

        assert response.status_code == status.HTTP_200_OK
        assert "cache-control" not in response.headers
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert "/v1/plugins/rpi-cam/pairing/register" in payload["paths"]
        assert "/v1/plugins/rpi-cam/pairing/poll" in payload["paths"]
        assert "/v1/plugins/rpi-cam/device/cameras/{camera_id}/image-upload" in payload["paths"]
        assert "/v1/plugins/rpi-cam/device/cameras/{camera_id}/preview-thumbnail-upload" in payload["paths"]
        assert "/v1/plugins/rpi-cam/device/cameras/{camera_id}/self" in payload["paths"]
        assert "/v1/products" not in payload["paths"]
        assert "/v1/admin/users" not in payload["paths"]

    async def test_openapi_includes_centralized_data_collection_examples(self, openapi_client: AsyncClient) -> None:
        """The OpenAPI schema should expose centralized data-collection examples."""
        response = await openapi_client.get("/openapi.json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()

        create_product_request_body = payload["paths"]["/v1/products"]["post"]["requestBody"]["content"][
            "application/json"
        ]
        assert create_product_request_body["examples"]["basic"]["value"]["name"] == "Office Chair"
        assert "components" in create_product_request_body["examples"]["with_components"]["value"]

        create_materials_request_body = payload["paths"]["/v1/products/{product_id}/materials"]["post"]["requestBody"][
            "content"
        ]["application/json"]
        assert create_materials_request_body["examples"]["multiple_materials"]["value"][0]["material_id"] == 1

        product_schema_examples = payload["components"]["schemas"]["ProductCreateWithComponents"]["examples"]
        assert product_schema_examples[0]["name"] == "Office Chair"

        assert "/v1/components/{component_id}/materials" in payload["paths"]
        assert "videos" not in payload["components"]["schemas"]["ComponentCreateWithComponents"]["properties"]
        assert (
            "videos"
            not in payload["components"]["schemas"]["ComponentReadWithRelationshipsAndFlatComponents"]["properties"]
        )

        camera_examples = payload["components"]["schemas"]["CameraRead"]["examples"]
        assert "created_at" in camera_examples[0]

    async def test_openapi_etag_supports_conditional_get(self, openapi_client: AsyncClient) -> None:
        """The public OpenAPI schema should return 304 for matching ETags."""
        first_response = await openapi_client.get("/openapi.json")

        assert first_response.status_code == status.HTTP_200_OK
        assert "etag" in first_response.headers

        second_response = await openapi_client.get(
            "/openapi.json",
            headers={"If-None-Match": first_response.headers["etag"]},
        )

        assert second_response.status_code == status.HTTP_304_NOT_MODIFIED

    async def test_internal_openapi_json_is_not_registered_in_production(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Production should expose public/device contracts but not full/admin contracts."""
        monkeypatch.setattr(settings, "environment", Environment.PROD)
        app = create_app()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.example.test") as client:
            public_schema = await client.get("/openapi.public.json")
            device_schema = await client.get("/openapi.device.json")
            canonical_schema = await client.get("/openapi.json")
            admin_schema = await client.get("/openapi.admin.json")

        assert public_schema.status_code == status.HTTP_200_OK
        assert device_schema.status_code == status.HTTP_200_OK
        assert canonical_schema.status_code == status.HTTP_404_NOT_FOUND
        assert admin_schema.status_code == status.HTTP_404_NOT_FOUND

    async def test_internal_openapi_json_remains_registered_in_testing(self, openapi_client: AsyncClient) -> None:
        """Testing keeps internal schemas available for client generation and contract checks."""
        canonical_schema = await openapi_client.get("/openapi.json")
        admin_schema = await openapi_client.get("/openapi.admin.json")
        device_schema = await openapi_client.get("/openapi.device.json")
        public_schema = await openapi_client.get("/openapi.public.json")

        assert canonical_schema.status_code == status.HTTP_200_OK
        assert admin_schema.status_code == status.HTTP_200_OK
        assert device_schema.status_code == status.HTTP_200_OK
        assert public_schema.status_code == status.HTTP_200_OK

    @pytest.mark.parametrize("path", ["/docs", "/docs/public", "/docs/device", "/docs/admin", "/redoc"])
    async def test_backend_does_not_host_openapi_html_docs(self, openapi_client: AsyncClient, path: str) -> None:
        """The backend should expose JSON contracts only; docs UI lives in the docs site."""
        response = await openapi_client.get(path)

        assert response.status_code == status.HTTP_404_NOT_FOUND
