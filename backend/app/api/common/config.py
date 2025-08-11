"""Configuration for common API components."""

from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import BaseSettings

from app.__version__ import version

# Set the project base directory and .env file
BASE_DIR: Path = (Path(__file__).parents[3]).resolve()


class OpenAPISettings(BaseModel):
    """Base OpenAPI settings."""

    title: str
    description: str
    version: str
    license_info: dict[str, str]
    x_tag_groups: list[dict[str, str | list[str]]]


class APISettings(BaseSettings):
    """Settings class to store settings related to common API components."""

    # OpenAPI docs metadata
    public_docs: OpenAPISettings = OpenAPISettings(
        title="Reverse Engineering Lab - Data Collection API",
        description="Data collection app for the reverse engineering lab project at CML.",
        version=version,
        license_info={
            "name": "GNU Affero General Public License v3.0",
            "url": "https://www.gnu.org/licenses/agpl-3.0.en.html",
        },
        x_tag_groups=[
            {"name": "Auth", "tags": ["auth", "organizations", "users"]},
            {"name": "Background Data", "tags": ["categories", "taxonomies", "materials", "product-types"]},
            {"name": "Data Collection", "tags": ["products"]},
            {"name": "Plugins", "tags": ["rpi-cam-management", "rpi-cam-interaction"]},
        ],
    )

    full_docs: OpenAPISettings = public_docs.model_copy(
        update={"x_tag_groups": [*public_docs.x_tag_groups, {"name": "Admin", "tags": ["admin"]}]}
    )


# Create a settings instance that can be imported throughout the app
settings = APISettings()
