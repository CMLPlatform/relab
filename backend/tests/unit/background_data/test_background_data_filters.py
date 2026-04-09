"""Unit tests for background_data filter helper functions (SQL-clause level, no DB required)."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

import pytest
from sqlalchemy import Table
from sqlalchemy.dialects import postgresql

from app.api.background_data.filters import CategoryFilter, MaterialFilter, ProductTypeFilter
from app.api.background_data.models import Category, Material, ProductType
from app.api.common.search_utils import TSVectorSearchMixin

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ClauseElement


def _table(model: type) -> Table:
    """Return the SQLAlchemy Table for a table model."""
    return cast("Table", vars(model)["__table__"])


def _sql(clause: ClauseElement) -> str:
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


# ruff: noqa : SLF001 # We are testing the _search_vector_col and _trigram_cols methods directly.
@pytest.mark.unit
@pytest.mark.parametrize(
    ("filter_cls", "table_name"),
    [
        pytest.param(MaterialFilter, "material", id="material"),
        pytest.param(ProductTypeFilter, "producttype", id="product_type"),
        pytest.param(CategoryFilter, "category", id="category"),
    ],
)
class TestFilterSearchVector:
    """Verify each Filter's _search_vector_col / _trigram_cols point at the correct model columns."""

    def test_search_vector_col_references_model(self, filter_cls: type[TSVectorSearchMixin], table_name: str) -> None:
        """The compiled search-vector column SQL must reference the model's table."""
        sql = _sql(filter_cls._search_vector_col())
        assert table_name in sql.lower()

    def test_trigram_cols_contains_name(self, filter_cls: type[TSVectorSearchMixin], table_name: str) -> None:  # noqa: ARG002
        """The trigram columns must include a 'name' field."""
        cols = filter_cls._trigram_cols()
        assert len(cols) >= 1
        assert "name" in _sql(cols[0]).lower()

    def test_filter_has_no_search_model_fields(self, filter_cls: type[TSVectorSearchMixin], table_name: str) -> None:  # noqa: ARG002
        """search_model_fields must be absent so fastapi-filter doesn't generate ILIKE queries."""
        assert not getattr(filter_cls.Constants, "search_model_fields", None)  # type: ignore[unresolved-attribute]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("model_cls", "expected_fields"),
    [
        pytest.param(Material, ["name", "description", "source"], id="material"),
        pytest.param(ProductType, ["name", "description"], id="product_type"),
        pytest.param(Category, ["name", "description"], id="category"),
    ],
)
class TestSearchVectorModel:
    """Verify each model declares a computed search_vector covering the expected fields."""

    def test_search_vector_is_computed(self, model_cls: type, expected_fields: list[str]) -> None:  # noqa: ARG002
        """The search_vector column must be a computed (generated) column."""
        col = _table(model_cls).c.search_vector
        assert col.computed is not None

    def test_search_vector_covers_expected_fields(self, model_cls: type, expected_fields: list[str]) -> None:
        """The computed expression must reference every field that should be searchable."""
        computed = _table(model_cls).c.search_vector.computed
        assert computed is not None
        sql = str(computed.sqltext)
        for field in expected_fields:
            assert field in sql
