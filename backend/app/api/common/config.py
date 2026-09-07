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
        title="Relab - Data Collection API",
        description=(
            "Data collection app for the Relab project at CML.\n\n"
            "**Licensing.** This API specification is licensed Apache-2.0 so that anyone may write "
            "clients, importers, or integrations against it without inheriting the platform's "
            "copyleft. The Relab platform software itself remains AGPL-3.0-or-later, and curated "
            "dataset releases are licensed CC BY 4.0."
        ),
        version=version,
        # Licence of the specification, not the software. Full text ships at LICENSE-APACHE-2.0
        # in the repository root, as Apache-2.0 section 4(a) requires. Apache-2.0 rather than
        # CC0 because the artifacts include generated client types and it carries a patent grant.
        license_info={
            "name": "Apache-2.0",
            "identifier": "Apache-2.0",
        },
        x_tag_groups=[
            {"name": "Auth", "tags": ["auth", "users"]},
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
