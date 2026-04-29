"""Unit tests for reference data schemas (no database required).

Covers business-rule constraints. Pydantic roundtrip and optional-field behavior is not tested.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.reference_data.models import TaxonomyDomain
from app.api.reference_data.schemas import MaterialCreate, TaxonomyCreate


def test_taxonomy_name_min_length() -> None:
    """Taxonomy name must be at least 2 characters."""
    with pytest.raises(ValidationError) as exc_info:
        TaxonomyCreate(name="A", version="1.0", domains={TaxonomyDomain.MATERIALS})

    errors = exc_info.value.errors()
    assert any(e["loc"][0] == "name" for e in errors)


def test_material_negative_density_rejected() -> None:
    """Material density must be greater than zero (business constraint)."""
    with pytest.raises(ValidationError) as exc_info:
        MaterialCreate(name="Invalid alloy", density_kg_m3=-100.0)

    errors = exc_info.value.errors()
    assert any(e["loc"][0] == "density_kg_m3" for e in errors)
