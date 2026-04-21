"""Integration tests for OpenAPI schema generation endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import status
from httpx import ASGITransport, AsyncClient

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from fastapi import FastAPI


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
    """Tests for public and full OpenAPI schema generation."""

    async def test_public_openapi_json_can_be_generated(self, openapi_client: AsyncClient) -> None:
        """The public OpenAPI schema endpoint should return valid JSON."""
        response = await openapi_client.get("/openapi.json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert isinstance(payload["paths"], dict)
        assert payload["paths"]
        assert "x-tagGroups" in payload
        assert "/auth/bearer/login" in payload["paths"]
        assert "/admin/materials" not in payload["paths"]
        assert "/admin/categories" not in payload["paths"]
        assert "/admin/taxonomies" not in payload["paths"]
        assert "/admin/cache/clear/{namespace}" not in payload["paths"]
        assert "/admin/users" not in payload["paths"]
        assert "/admin/organizations" not in payload["paths"]
        assert "/admin/newsletter/subscribers" not in payload["paths"]
        assert "/newsletter/subscribe" not in payload["paths"]

        categories_name_filter_param = next(
            parameter
            for parameter in payload["paths"]["/categories"]["get"]["parameters"]
            if parameter["name"] == "name__ilike"
        )
        assert categories_name_filter_param["schema"]["anyOf"][0]["type"] == "string"

        category_schema_examples = payload["components"]["schemas"]["CategoryRead"]["examples"]
        assert category_schema_examples[0]["taxonomy_id"] == 1

        image_resize_width_param = next(
            parameter
            for parameter in payload["paths"]["/images/{image_id}/resized"]["get"]["parameters"]
            if parameter["name"] == "width"
        )
        assert image_resize_width_param["examples"]["thumbnail"]["value"] == 200

        rpi_include_status_param = next(
            parameter
            for parameter in payload["paths"]["/plugins/rpi-cam/cameras"]["get"]["parameters"]
            if parameter["name"] == "include_status"
        )
        assert rpi_include_status_param["examples"]["enabled"]["value"] is True

        camera_create_examples = payload["components"]["schemas"]["CameraCreate"]["examples"]
        assert camera_create_examples[0]["name"] == "Workbench Camera"

        video_create_examples = payload["components"]["schemas"]["VideoCreateWithinProduct"]["examples"]
        assert video_create_examples[0]["video_metadata"]["source"] == "youtube"

        user_create_examples = payload["components"]["schemas"]["UserCreate"]["examples"]
        assert user_create_examples[0]["username"] == "username"

        refresh_response_examples = payload["components"]["schemas"]["RefreshTokenResponse"]["examples"]
        assert refresh_response_examples[0]["token_type"] == "bearer"

    async def test_full_openapi_json_can_be_generated(self, openapi_client: AsyncClient) -> None:
        """The full OpenAPI schema endpoint should render successfully in dev/test."""
        response = await openapi_client.get("/openapi_full.json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()
        assert payload["openapi"].startswith("3.")
        assert isinstance(payload["paths"], dict)
        assert payload["paths"]
        assert "/admin/materials" in payload["paths"]
        assert "/admin/categories" in payload["paths"]
        assert "/admin/taxonomies" in payload["paths"]
        assert "/admin/cache/clear/{namespace}" in payload["paths"]
        assert "/admin/users" in payload["paths"]
        assert "/admin/organizations" in payload["paths"]
        assert "/admin/newsletter/subscribers" in payload["paths"]
        assert "/auth/oauth/google/session/authorize" in payload["paths"]
        assert "/newsletter/subscribe" in payload["paths"]

        newsletter_subscribe_request = payload["paths"]["/newsletter/subscribe"]["post"]["requestBody"]["content"][
            "application/json"
        ]
        assert newsletter_subscribe_request["examples"]["subscriber_email"]["value"] == "subscriber@example.com"

        newsletter_preference_examples = payload["components"]["schemas"]["NewsletterPreferenceRead"]["examples"]
        assert newsletter_preference_examples[0]["subscribed"] is True

        admin_users_email_filter_param = next(
            parameter
            for parameter in payload["paths"]["/admin/users"]["get"]["parameters"]
            if parameter["name"] == "email__ilike"
        )
        assert admin_users_email_filter_param["schema"]["anyOf"][0]["type"] == "string"

        admin_users_response_examples = payload["paths"]["/admin/users"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["examples"]
        assert admin_users_response_examples["with_organization"]["value"][0]["organization"]["name"] == (
            "University of Example"
        )

    async def test_openapi_includes_centralized_data_collection_examples(self, openapi_client: AsyncClient) -> None:
        """The OpenAPI schema should expose centralized data-collection examples."""
        response = await openapi_client.get("/openapi.json")

        assert response.status_code == status.HTTP_200_OK
        payload = response.json()

        create_product_request_body = payload["paths"]["/products"]["post"]["requestBody"]["content"][
            "application/json"
        ]
        assert create_product_request_body["examples"]["basic"]["value"]["name"] == "Office Chair"
        assert "components" in create_product_request_body["examples"]["with_components"]["value"]

        create_materials_request_body = payload["paths"]["/products/{product_id}/materials"]["post"]["requestBody"][
            "content"
        ]["application/json"]
        assert create_materials_request_body["examples"]["multiple_materials"]["value"][0]["material_id"] == 1

        product_schema_examples = payload["components"]["schemas"]["ProductCreateWithComponents"]["examples"]
        assert product_schema_examples[0]["name"] == "Office Chair"

        product_list_parameters = payload["paths"]["/products"]["get"].get("parameters", [])
        assert all(parameter["name"] != "include" for parameter in product_list_parameters)

        user_product_list_parameters = payload["paths"]["/users/{user_id}/products"]["get"].get("parameters", [])
        assert all(parameter["name"] != "include" for parameter in user_product_list_parameters)

        product_detail_parameters = payload["paths"]["/products/{product_id}"]["get"].get("parameters", [])
        assert all(parameter["name"] != "include" for parameter in product_detail_parameters)

        product_component_list_parameters = payload["paths"]["/products/{product_id}/components"]["get"].get(
            "parameters", []
        )
        assert all(parameter["name"] != "include" for parameter in product_component_list_parameters)

        product_component_detail_parameters = payload["paths"]["/products/{product_id}/components/{component_id}"][
            "get"
        ].get("parameters", [])
        assert all(parameter["name"] != "include" for parameter in product_component_detail_parameters)

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
