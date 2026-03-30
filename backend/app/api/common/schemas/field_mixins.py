"""Pure Pydantic field mixins shared by API schemas.

These mixins deliberately avoid SQLModel/ORM field configuration so read and
request schemas can evolve independently from persistence models.
"""

from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.api.background_data.models import TaxonomyDomain


class PhysicalPropertiesFields(BaseModel):
    """Shared physical property fields for API schemas."""

    weight_g: float | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    width_cm: float | None = Field(default=None, gt=0)
    depth_cm: float | None = Field(default=None, gt=0)


class CircularityPropertiesFields(BaseModel):
    """Shared circularity property fields for API schemas."""

    recyclability_observation: str | None = Field(default=None, max_length=500)
    recyclability_comment: str | None = Field(default=None, max_length=100)
    recyclability_reference: str | None = Field(default=None, max_length=100)
    repairability_observation: str | None = Field(default=None, max_length=500)
    repairability_comment: str | None = Field(default=None, max_length=100)
    repairability_reference: str | None = Field(default=None, max_length=100)
    remanufacturability_observation: str | None = Field(default=None, max_length=500)
    remanufacturability_comment: str | None = Field(default=None, max_length=100)
    remanufacturability_reference: str | None = Field(default=None, max_length=100)


class ProductFields(BaseModel):
    """Shared product fields for API schemas."""

    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    dismantling_notes: str | None = Field(
        default=None,
        max_length=500,
        description="Notes on the dismantling process of the product.",
    )
    dismantling_time_start: datetime = Field(default_factory=lambda: datetime.now(UTC))
    dismantling_time_end: datetime | None = None


class MaterialFields(BaseModel):
    """Shared material fields for API schemas."""

    name: str = Field(min_length=2, max_length=100, description="Name of the Material")
    description: str | None = Field(default=None, max_length=500, description="Description of the Material")
    source: str | None = Field(
        default=None,
        max_length=100,
        description="Source of the material data, e.g. URL, IRI or citation key",
    )
    density_kg_m3: float | None = Field(default=None, gt=0, description="Volumetric density (kg/m^3)")
    is_crm: bool | None = Field(default=None, description="Is this material a Critical Raw Material (CRM)?")


class ProductTypeFields(BaseModel):
    """Shared product-type fields for API schemas."""

    name: str = Field(min_length=2, max_length=100, description="Name of the Product Type.")
    description: str | None = Field(default=None, max_length=500, description="Description of the Product Type.")


class CategoryFields(BaseModel):
    """Shared category fields for API schemas."""

    name: str = Field(min_length=2, max_length=250, description="Name of the category")
    description: str | None = Field(default=None, max_length=500, description="Description of the category")
    external_id: str | None = Field(default=None, description="ID of the category in the external taxonomy")


class TaxonomyFields(BaseModel):
    """Shared taxonomy fields for API schemas."""

    model_config = ConfigDict(use_enum_values=True)

    name: str = Field(min_length=2, max_length=100)
    version: str | None = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    domains: set[TaxonomyDomain] = Field(
        description=f"Domains of the taxonomy, e.g. {{{', '.join([d.value for d in TaxonomyDomain][:3])}}}"
    )
    source: str | None = Field(
        default=None,
        max_length=500,
        description="Source of the taxonomy data, e.g. URL, IRI or citation key",
    )
