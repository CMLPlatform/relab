"""Pure Pydantic field mixins shared by API schemas.

These mixins deliberately avoid ORM field configuration so read and
request schemas can evolve independently from persistence models.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.reference_data.models import TaxonomyDomain


class PhysicalPropertiesFields(BaseModel):
    """Shared physical property fields for read schemas.

    No gt=0 constraints here — validation belongs on write schemas / model base.
    Read schemas must accept whatever the DB returns.
    """

    weight_g: float | None = None
    height_cm: float | None = None
    width_cm: float | None = None
    depth_cm: float | None = None
    volume_cm3: float | None = None


class CircularityPropertiesFields(BaseModel):
    """Circularity note fields stored as a product JSON object."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    recyclability: str | None = Field(default=None, max_length=500)
    disassemblability: str | None = Field(default=None, max_length=500)
    remanufacturability: str | None = Field(default=None, max_length=500)

    @field_validator("recyclability", "disassemblability", "remanufacturability", mode="after")
    @classmethod
    def normalize_empty_note(cls, value: str | None) -> str | None:
        """Treat empty note strings as absent values."""
        if value == "":
            return None
        return value


class ProductCircularityPropertiesFields(BaseModel):
    """Shared product field for circularity notes."""

    circularity_properties: CircularityPropertiesFields | None = None

    @field_validator("circularity_properties", mode="after")
    @classmethod
    def normalize_empty_circularity_properties(
        cls, value: CircularityPropertiesFields | None
    ) -> CircularityPropertiesFields | None:
        """Use null as the canonical empty circularity-properties value."""
        if value is None:
            return None
        if value.model_dump(exclude_none=True) == {}:
            return None
        return value


class ProductFields(BaseModel):
    """Shared product fields for API schemas."""

    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)


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
