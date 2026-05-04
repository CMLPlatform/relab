"""Unit tests for reference_data filter helper functions (SQL-clause level, no DB required)."""
# Private member behaviour is tested here, so we want to allow it.

from __future__ import annotations

from typing import TYPE_CHECKING, cast

import pytest
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Table, select
from sqlalchemy.dialects import postgresql

from app.api.common.crud.filtering import BaseFilterSet, apply_filter
from app.api.common.validation import BoundedQueryText, BoundedQueryTextList
from app.api.reference_data.filters import CategoryFilter, MaterialFilter, ProductTypeFilter, TaxonomyFilter
from app.api.reference_data.models import Category, Material, ProductType, Taxonomy

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ClauseElement

_QUERY_TEXT_ADAPTER = TypeAdapter(BoundedQueryText)
_QUERY_TEXT_LIST_ADAPTER = TypeAdapter(BoundedQueryTextList)


def _table(model: type) -> Table:
    """Return the SQLAlchemy Table for a table model."""
    return cast("Table", vars(model)["__table__"])


def _sql(clause: ClauseElement) -> str:
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


def _from_ilike(filter_cls: type[BaseFilterSet], field: str, value: str) -> BaseFilterSet:
    """Build a filter set using the same text validation as FastAPI query parsing."""
    validated = _QUERY_TEXT_ADAPTER.validate_python(value)
    return filter_cls.from_ops(getattr(filter_cls, field).ilike(validated))


def _from_in(filter_cls: type[BaseFilterSet], field: str, values: list[str]) -> BaseFilterSet:
    """Build a filter set using the same list validation as FastAPI query parsing."""
    validated = _QUERY_TEXT_LIST_ADAPTER.validate_python(values)
    return filter_cls.from_ops(getattr(filter_cls, field).in_(validated))


@pytest.mark.parametrize(
    ("filter_cls", "table_name"),
    [
        pytest.param(MaterialFilter, "material", id="material"),
        pytest.param(ProductTypeFilter, "producttype", id="product_type"),
        pytest.param(CategoryFilter, "category", id="category"),
    ],
)
class TestFilterSearchVector:
    """Verify each Filter's search columns point at the correct model columns."""

    def test_search_vector_col_references_model(self, filter_cls: type, table_name: str) -> None:
        """The compiled search-vector column SQL must reference the model's table."""
        sql = _sql(filter_cls.search_vector_column())
        assert table_name in sql.lower()

    def test_trigram_cols_contains_name(self, filter_cls: type, table_name: str) -> None:
        """The trigram columns must include a 'name' field."""
        cols = filter_cls.trigram_columns()
        assert len(cols) >= 1
        sql = _sql(cols[0]).lower()
        assert table_name in sql
        assert "name" in sql

    def test_search_is_handled_by_relab_adapter(self, filter_cls: type, table_name: str) -> None:
        """Search should remain PostgreSQL tsvector/trigram logic owned by RELab."""
        statement = apply_filter(
            select(filter_cls.filter_model),
            filter_cls.filter_model,
            filter_cls().with_search("steel"),
        )

        sql = _sql(statement).lower()
        assert table_name in sql
        assert "websearch_to_tsquery" in sql


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

    def test_search_vector_is_computed(self, model_cls: type, expected_fields: list[str]) -> None:
        """The search_vector column must be a computed (generated) column."""
        col = _table(model_cls).c.search_vector
        assert col.computed is not None
        assert expected_fields

    def test_search_vector_covers_expected_fields(self, model_cls: type, expected_fields: list[str]) -> None:
        """The computed expression must reference every field that should be searchable."""
        computed = _table(model_cls).c.search_vector.computed
        assert computed is not None
        sql = str(computed.sqltext)
        for field in expected_fields:
            assert field in sql


class TestReferenceDataFilterInputBounds:
    """Tests for bounded reference-data filter inputs."""

    def test_search_is_trimmed(self) -> None:
        """Search query values are trimmed during validation."""
        assert MaterialFilter().with_search("  steel  ").search == "steel"

    @pytest.mark.parametrize(
        ("filter_cls", "field"),
        [
            pytest.param(MaterialFilter, "name", id="material-name"),
            pytest.param(ProductTypeFilter, "description", id="product-type-description"),
            pytest.param(CategoryFilter, "external_id", id="category-external-id"),
        ],
    )
    def test_ilike_fields_reject_overlong_values(self, filter_cls: type, field: str) -> None:
        """Search-like query strings should have a practical upper bound."""
        with pytest.raises(ValidationError):
            _from_ilike(filter_cls, field, "a" * 101)

    def test_name_in_rejects_too_many_values(self) -> None:
        """List filters should have a practical item-count bound."""
        with pytest.raises(ValidationError):
            _from_in(ProductTypeFilter, "name", [f"type-{i}" for i in range(51)])


class TestTaxonomySearchColumns:
    """Tests for simpler search-column fallback filters."""

    def test_search_column_value_is_bound_not_sql_text(self) -> None:
        """Taxonomy free-text search should bind values even without tsvector search."""
        search = "taxonomy'); DROP TABLE taxonomy; --"

        compiled = apply_filter(select(Taxonomy), Taxonomy, TaxonomyFilter().with_search(search)).compile(
            dialect=postgresql.dialect()
        )

        assert search not in str(compiled)
        assert {f"%{search}%"} == set(compiled.params.values())
