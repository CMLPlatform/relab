"""Tests for data_collection and shared search filter helper functions."""
# spell-checker: ignore Makita

from __future__ import annotations

from typing import TYPE_CHECKING, Literal, cast, get_args, get_origin

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ClauseElement

import pytest
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.api.common.crud.filtering import BaseFilterSet, apply_filter
from app.api.common.validation import BoundedQueryText, BoundedQueryTextList
from app.api.data_collection.filters import (
    ProductFilter,
    get_brand_search_statement,
    get_model_search_statement,
    get_product_facet_statement,
)
from app.api.data_collection.models.product import Product
from app.api.data_collection.routers import ProductFacetField, get_brand_suggestions, get_model_suggestions

_QUERY_TEXT_ADAPTER = TypeAdapter(BoundedQueryText)
_QUERY_TEXT_LIST_ADAPTER = TypeAdapter(BoundedQueryTextList)


def _sql(clause: ClauseElement) -> str:
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


def _compiled(clause: ClauseElement) -> object:
    """Compile a clause for assertions on SQL text and bound parameters."""
    return clause.compile(dialect=postgresql.dialect())


def _from_ilike(filter_cls: type[BaseFilterSet], field: str, value: str) -> BaseFilterSet:
    """Build a filter set using the same text validation as FastAPI query parsing."""
    validated = _QUERY_TEXT_ADAPTER.validate_python(value)
    return filter_cls.from_ops(getattr(filter_cls, field).ilike(validated))


def _from_in(filter_cls: type[BaseFilterSet], field: str, values: list[str]) -> BaseFilterSet:
    """Build a filter set using the same list validation as FastAPI query parsing."""
    validated = _QUERY_TEXT_LIST_ADAPTER.validate_python(values)
    return filter_cls.from_ops(getattr(filter_cls, field).in_(validated))


def _order_annotation_args(endpoint: object) -> tuple[object, ...]:
    """Return the Literal values from a suggestion endpoint's order annotation."""
    annotation = endpoint.__annotations__["order"]
    annotated_args = get_args(annotation)
    literal = annotated_args[0]
    assert get_origin(literal) is Literal
    return get_args(literal)


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
        stripped = _sql(get_brand_search_statement(search="nike"))
        padded = _sql(get_brand_search_statement(search="  nike  "))
        assert stripped == padded

    def test_empty_search_is_treated_as_absent(self) -> None:
        """Whitespace-only search values should not generate ineffective clauses."""
        assert _sql(get_brand_search_statement(search="   ")) == _sql(get_brand_search_statement())

    def test_overlong_search_is_rejected_by_helper(self) -> None:
        """Suggestion helper callers get the same search bound as filter models."""
        with pytest.raises(ValueError, match="at most 100"):
            get_brand_search_statement(search="a" * 101)

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

    def test_search_text_is_bound_not_concatenated_into_sql(self) -> None:
        """Search input should be passed through SQLAlchemy bind params."""
        search = "brand'); DROP TABLE product; --"
        compiled = _compiled(get_brand_search_statement(search=search))
        sql = str(compiled)

        assert search not in sql
        assert search.lower() in compiled.params.values()

    def test_model_search_uses_same_bound_parameter_path(self) -> None:
        """Model suggestions should use the same parameterized search helper."""
        search = "model'); DROP TABLE product; --"
        compiled = _compiled(get_model_search_statement(search=search))
        sql = str(compiled)

        assert search not in sql
        assert search.lower() in compiled.params.values()

    def test_order_is_limited_by_route_literal_annotations(self) -> None:
        """Suggestion endpoints expose only asc/desc ordering to request data."""
        assert _order_annotation_args(get_brand_suggestions) == ("asc", "desc")
        assert _order_annotation_args(get_model_suggestions) == ("asc", "desc")


class TestProductFacetsAllowlist:
    """Tests for product facet identifier allowlisting."""

    def test_facet_field_literal_contains_only_supported_columns(self) -> None:
        """Facet fields must stay allowlisted before reaching getattr(Product, field)."""
        assert get_args(ProductFacetField) == ("brand", "model")

    def test_facet_statement_uses_requested_allowlisted_field(self) -> None:
        """Allowed facet fields should compile to their corresponding product columns."""
        brand_sql = _sql(get_product_facet_statement("brand")).lower()
        model_sql = _sql(get_product_facet_statement("model")).lower()

        assert "product.brand" in brand_sql
        assert "product.model" in model_sql

    def test_facet_statement_rejects_non_allowlisted_field(self) -> None:
        """Internal misuse should fail before an arbitrary Product attribute can be selected."""
        unsafe = cast("ProductFacetField", "name; DROP TABLE product; --")

        with pytest.raises(KeyError):
            get_product_facet_statement(unsafe)


class TestProductFilterRankSort:
    """Tests for ProductFilter's search relevance ordering behaviour."""

    def _filter_sql(self, search: str | None, order_by: list[tuple[str, str, None]] | None) -> str:
        """Build a ProductFilter, apply filter + sort, and return the compiled SQL."""
        product_filter = ProductFilter().with_search(search)
        stmt = apply_filter(select(Product), Product, product_filter.with_sorting(order_by or []))
        return _sql(stmt)

    def test_rank_ordering_applied_when_search_and_no_order_by(self) -> None:
        """ts_rank ordering is the default when searching without an explicit sort."""
        sql = self._filter_sql("chair", None)
        assert "ts_rank" in sql.lower()

    def test_rank_ordering_not_applied_when_explicit_field_given(self) -> None:
        """An explicit field sort must suppress ts_rank ordering."""
        sql = self._filter_sql("chair", [("created_at", "desc", None)])
        assert "created_at" in sql.lower()
        assert "ts_rank" not in sql.lower()

    def test_search_where_clause_always_present(self) -> None:
        """The tsvector WHERE clause is always added when search is set, regardless of sort."""
        for order in (None, [("created_at", "desc", None)], [("name", "asc", None)]):
            sql = self._filter_sql("test", order)
            assert "websearch_to_tsquery" in sql, f"Missing WHERE clause for order_by={order}"

    def test_no_rank_ordering_when_no_search(self) -> None:
        """ts_rank ordering must not appear when there is no search term."""
        sql = self._filter_sql(None, None)
        assert "ts_rank" not in sql.lower()


class TestProductFilterInputBounds:
    """Tests for bounded search/filter query inputs."""

    def test_search_is_trimmed(self) -> None:
        """Search query values are trimmed during validation."""
        assert ProductFilter().with_search("  drill  ").search == "drill"

    @pytest.mark.parametrize("field", ["search", "name", "description", "brand", "model"])
    def test_search_like_fields_reject_overlong_values(self, field: str) -> None:
        """Search-like query strings should have a practical upper bound."""
        build_filter = (
            (lambda value: ProductFilter().with_search(value))
            if field == "search"
            else (lambda value: _from_ilike(ProductFilter, field, value))
        )

        with pytest.raises(ValidationError):
            build_filter("a" * 101)

    def test_brand_in_rejects_too_many_values(self) -> None:
        """List filters should have a practical item-count bound."""
        with pytest.raises(ValidationError):
            _from_in(ProductFilter, "brand", [f"brand-{i}" for i in range(51)])

    def test_ilike_filter_value_is_bound_not_sql_text(self) -> None:
        """Structured text filters should pass request values as bind params."""
        value = "brand'); DROP TABLE product; --"
        product_filter = _from_ilike(ProductFilter, "brand", value)

        compiled = _compiled(apply_filter(select(Product), Product, product_filter))

        assert value not in str(compiled)
        assert value in compiled.params.values()

    def test_in_filter_values_are_bound_not_sql_text(self) -> None:
        """List filters should pass request values through SQLAlchemy bind params."""
        values = ["Bosch", "Makita'); DROP TABLE product; --"]
        product_filter = _from_in(ProductFilter, "brand", values)

        compiled = _compiled(apply_filter(select(Product), Product, product_filter))

        assert all(value not in str(compiled) for value in values)
        assert values in compiled.params.values()
