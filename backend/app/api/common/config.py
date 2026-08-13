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
        # The specification, not the software. Full licence text ships at LICENSE-APACHE-2.0 in the
        # repository root — Apache-2.0 section 4(a) requires recipients to get a copy, so asserting
        # the licence here without shipping the terms would leave the grant incomplete.
        # Publishing an integration surface under network
        # copyleft deters exactly the third-party tooling the project wants, and an interface
        # description is thin copyright anyway (see Directive 2009/24/EC art. 1(2), which excludes
        # the ideas and principles underlying interfaces). Apache-2.0 rather than CC0 because these
        # artifacts include generated client types — software, which CC advises against covering
        # with CC licences — and because it carries a patent grant.
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
