"""Tests for data_collection filter helper functions."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from typing import Any

from sqlalchemy import literal_column
from sqlalchemy.dialects import postgresql

from app.api.data_collection.filters import (
    build_brand_search_clause,
    build_product_search_clause,
    get_brand_search_statement,
)
from app.api.data_collection.models import Product


def _sql(clause: Any) -> str:  # noqa: ANN401
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


_SEARCH_VECTOR = literal_column("product.search_vector")


class TestBuildProductSearchClause:
    """Tests for the build_product_search_clause function."""

    def test_without_name_produces_two_conditions(self) -> None:
        """Test that searching without a name field produces two conditions."""
        clause = build_product_search_clause("test", Product.brand, _SEARCH_VECTOR)
        assert len(list(clause.clauses)) == 2

    def test_with_name_produces_three_conditions(self) -> None:
        """Test that searching with a name field produces three conditions."""
        clause = build_product_search_clause("test", Product.brand, _SEARCH_VECTOR, name_field=Product.name)
        assert len(list(clause.clauses)) == 3

    def test_contains_tsvector_match_operator(self) -> None:
        """Test that the clause contains the tsvector match operator (@@)."""
        sql = _sql(build_product_search_clause("hello", Product.brand, _SEARCH_VECTOR))
        assert "@@" in sql

    def test_contains_trigram_operator_for_brand(self) -> None:
        """Test that the clause contains the trigram operator (%) for the brand field."""
        sql = _sql(build_product_search_clause("hello", Product.brand, _SEARCH_VECTOR))
        assert "%" in sql
        assert "brand" in sql.lower()

    def test_contains_trigram_operator_for_name_when_given(self) -> None:
        """Test that the clause contains the trigram operator for the name field when provided."""
        sql = _sql(build_product_search_clause("hello", Product.brand, _SEARCH_VECTOR, name_field=Product.name))
        assert "name" in sql.lower()

    def test_name_absent_when_not_given(self) -> None:
        """Test that the name field is absent from the clause when not provided."""
        sql = _sql(build_product_search_clause("hello", Product.brand, _SEARCH_VECTOR))
        assert "product.name" not in sql.lower()

    def test_uses_websearch_to_tsquery(self) -> None:
        """Test that the clause uses websearch_to_tsquery for the tsvector search."""
        sql = _sql(build_product_search_clause("hello world", Product.brand, _SEARCH_VECTOR))
        assert "websearch_to_tsquery" in sql


class TestBuildBrandSearchClause:
    """Tests for the build_brand_search_clause function."""

    def test_produces_same_sql_as_product_search_without_name(self) -> None:
        """Test that brand search produces same SQL as product search without name."""
        brand_sql = _sql(build_brand_search_clause("acme"))
        product_sql = _sql(build_product_search_clause("acme", Product.brand, _SEARCH_VECTOR))
        assert brand_sql == product_sql

    def test_uses_websearch_to_tsquery(self) -> None:
        """Test that brand search uses websearch_to_tsquery."""
        assert "websearch_to_tsquery" in _sql(build_brand_search_clause("acme corp"))


class TestGetBrandSearchStatement:
    """Tests for the get_brand_search_statement function."""

    def test_filters_null_brands(self) -> None:
        """Test that null brands are filtered out."""
        sql = _sql(get_brand_search_statement())
        assert "IS NOT NULL" in sql.upper()

    def test_returns_distinct_results(self) -> None:
        """Test that distinct results are returned."""
        sql = _sql(get_brand_search_statement())
        assert "DISTINCT" in sql.upper()

    def test_no_search_omits_tsvector_clause(self) -> None:
        """Test that no search query omits the tsvector clause."""
        sql = _sql(get_brand_search_statement())
        assert "websearch_to_tsquery" not in sql

    def test_with_search_adds_where_clause(self) -> None:
        """Test that a search query adds a WHERE clause using websearch_to_tsquery."""
        sql = _sql(get_brand_search_statement(search="nike"))
        assert "websearch_to_tsquery" in sql

    def test_search_strips_whitespace(self) -> None:
        """Test that search queries are stripped of leading/trailing whitespace."""
        # Both should produce identical SQL since strip() is applied before building the clause
        stripped = _sql(get_brand_search_statement(search="nike"))
        padded = _sql(get_brand_search_statement(search="  nike  "))
        assert stripped == padded

    def test_default_order_is_asc(self) -> None:
        """Test that the default order is ascending."""
        sql = _sql(get_brand_search_statement())
        assert "DESC" not in sql.upper()

    def test_order_desc(self) -> None:
        """Test that ordering can be set to descending."""
        sql = _sql(get_brand_search_statement(order="desc"))
        assert "DESC" in sql.upper()

    def test_order_asc_explicit(self) -> None:
        """Test that ordering can be explicitly set to ascending."""
        sql_default = _sql(get_brand_search_statement())
        sql_asc = _sql(get_brand_search_statement(order="asc"))
        assert sql_default == sql_asc
