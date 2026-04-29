"""Static OpenAPI metadata shared across common API routers."""

from pydantic import BaseModel, Field

from app.__version__ import version


class OpenAPISettings(BaseModel):
    """Base OpenAPI settings."""

    title: str
    description: str
    version: str
    license_info: dict[str, str]
    x_tag_groups: list[dict[str, str | list[str]]]


def build_public_docs() -> OpenAPISettings:
    """Build public OpenAPI metadata."""
    return OpenAPISettings(
        title="Reverse Engineering Lab - Data Collection API",
        description="Data collection app for the reverse engineering lab project at CML.",
        version=version,
        license_info={
            "name": "GNU Affero General Public License v3.0",
            "url": "https://www.gnu.org/licenses/agpl-3.0.en.html",
        },
        x_tag_groups=[
            {"name": "Auth", "tags": ["auth", "organizations", "users"]},
            {"name": "Reference Data", "tags": ["categories", "taxonomies", "materials", "product-types"]},
            {"name": "Data Collection", "tags": ["products"]},
            {"name": "Plugins", "tags": ["rpi-cam-management", "rpi-cam-interaction"]},
        ],
    )


def build_full_docs() -> OpenAPISettings:
    """Build internal OpenAPI metadata from the public docs shape."""
    public_docs = build_public_docs()
    return public_docs.model_copy(
        update={"x_tag_groups": [*public_docs.x_tag_groups, {"name": "Admin", "tags": ["admin"]}]}
    )


class APISettings(BaseModel):
    """Static OpenAPI metadata shared across the API."""

    public_docs: OpenAPISettings = Field(default_factory=build_public_docs)
    full_docs: OpenAPISettings = Field(default_factory=build_full_docs)


settings = APISettings()
