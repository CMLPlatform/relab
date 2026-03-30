"""Unit tests for shared test-factory behaviour."""

from tests.factories.models import CategoryFactory, MaterialFactory


class TestBaseModelFactory:
    """Regression tests for shared SQLAlchemy factory defaults."""

    def test_build_skips_material_search_vector(self) -> None:
        """Generated TSVECTOR columns should be left for Postgres to populate."""
        material = MaterialFactory.build(name="Steel")
        assert material.search_vector is None

    def test_build_skips_category_search_vector(self) -> None:
        """Skipping computed fields should apply across all models using the base factory."""
        category = CategoryFactory.build(name="Metals")
        assert category.search_vector is None
