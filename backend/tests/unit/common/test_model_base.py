"""Unit tests for shared model base helpers."""

from __future__ import annotations

import pytest

from app.api.common.models.base import camel_to_capital, get_model_label_plural, pluralize_camel_name


@pytest.mark.unit
class TestModelNamingHelpers:
    """Tests for shared API model naming helpers."""

    def test_pluralization_handles_existing_backend_model_names(self) -> None:
        """Pluralization should support common backend resource names."""
        assert pluralize_camel_name("Category") == "Categories"
        assert pluralize_camel_name("Taxonomy") == "Taxonomies"
        assert pluralize_camel_name("ProductType") == "ProductTypes"

    def test_pluralization_handles_y_suffix_edge_cases(self) -> None:
        """Words ending in vowel+y should not be pluralized as ``ies``."""
        assert pluralize_camel_name("Key") == "Keys"
        assert camel_to_capital("ProductType") == "Product Type"

    def test_model_label_plural_uses_human_readable_plural(self) -> None:
        """Plural helper should produce display-ready labels."""
        product_type_model = type("ProductType", (), {})

        assert get_model_label_plural(product_type_model) == "Product Types"
