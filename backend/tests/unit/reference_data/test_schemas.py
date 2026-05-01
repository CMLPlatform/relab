"""Unit tests for reference data schemas (no database required).

Covers business-rule constraints. Pydantic roundtrip and optional-field behavior is not tested.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.reference_data.models import TaxonomyDomain
from app.api.reference_data.schemas import CategoryCreate, MaterialCreate, TaxonomyCreate


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


def test_material_source_normalizes_user_text_to_nfc() -> None:
    """Reference data write schemas normalize free-form text."""
    material = MaterialCreate(name="Cafe\u0301 alloy", source="Leiden")

    assert material.name == "Café alloy"


def test_category_create_rejects_hidden_control_characters() -> None:
    """Reference data names should reject hidden control bytes."""
    with pytest.raises(ValidationError):
        CategoryCreate(name="Battery\u0007pack", taxonomy_id=1)
