"""Tests for data_collection and shared search filter helper functions."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ClauseElement

from sqlalchemy.dialects import postgresql
from sqlmodel import select

from app.api.data_collection.filters import ProductFilter, get_brand_search_statement
from app.api.data_collection.models import Product


def _sql(clause: ClauseElement) -> str:
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


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


@pytest.mark.unit
class TestProductFilterRankSort:
    """Tests for ProductFilter's relevance-rank ordering behaviour.

    'rank'/'- rank' is stripped at construction time (model_validator mode="before")
    before fastapi-filter's validate_order_by sees the list.  When the list becomes
    empty/None after stripping, _apply_rank_ordering treats it as "apply ts_rank".
    """

    def _build(self, search: str | None, order_by: list[str] | None) -> ProductFilter:
        return ProductFilter(search=search, order_by=order_by)

    def _filter_sql(self, search: str | None, order_by: list[str] | None) -> str:
        """Build a ProductFilter, apply filter + sort, and return the compiled SQL."""
        f = self._build(search, order_by)
        stmt = f.filter(select(Product))
        stmt = f.sort(stmt)
        return _sql(stmt)

    # ── Construction-time stripping ───────────────────────────────────────────

    def test_rank_stripped_from_order_by_list(self) -> None:
        """order_by=['rank'] (list form) must become None after model_validator strips it."""
        f = self._build("chair", ["rank"])
        assert f.order_by is None

    def test_rank_stripped_from_order_by_string(self) -> None:
        """order_by='rank' (raw string, as FastAPI delivers query params) is also stripped."""
        # Bypass _build helper to pass a raw string, simulating the FastAPI query-param path.
        f = ProductFilter.model_validate({"search": "chair", "order_by": "rank"})
        assert f.order_by is None

    def test_negative_rank_stripped(self) -> None:
        """order_by=['-rank'] must also be stripped to None."""
        f = self._build("chair", ["-rank"])
        assert f.order_by is None

    def test_rank_among_other_fields_is_removed(self) -> None:
        """Only 'rank' is stripped; other fields survive."""
        f = self._build("chair", ["rank", "-created_at"])
        assert f.order_by == ["-created_at"]

    def test_rank_string_among_other_fields_is_removed(self) -> None:
        """String form 'rank,-created_at' → only '-created_at' survives."""
        f = ProductFilter.model_validate({"order_by": "rank,-created_at"})
        assert f.order_by == ["-created_at"]

    def test_valid_order_by_unchanged(self) -> None:
        """A valid order_by with no 'rank' should be left unchanged."""
        f = self._build(None, ["-created_at"])
        assert f.order_by == ["-created_at"]

    # ── SQL ordering ──────────────────────────────────────────────────────────

    def test_rank_ordering_applied_when_search_and_no_order_by(self) -> None:
        """ts_rank ordering is the default when searching without an explicit sort."""
        sql = self._filter_sql("chair", None)
        assert "ts_rank" in sql.lower()

    def test_rank_ordering_applied_when_order_by_was_rank(self) -> None:
        """order_by=['rank'] strips to None, which triggers ts_rank ordering."""
        sql = self._filter_sql("chair", ["rank"])
        assert "ts_rank" in sql.lower()

    def test_rank_ordering_not_applied_when_explicit_field_given(self) -> None:
        """An explicit field sort must suppress ts_rank ordering."""
        sql = self._filter_sql("chair", ["-created_at"])
        assert "created_at" in sql.lower()
        assert "ts_rank" not in sql.lower()

    def test_search_where_clause_always_present(self) -> None:
        """The tsvector WHERE clause is always added when search is set, regardless of sort."""
        for order in (None, ["rank"], ["-created_at"], ["name"]):
            sql = self._filter_sql("test", order)
            assert "websearch_to_tsquery" in sql, f"Missing WHERE clause for order_by={order}"

    def test_no_rank_ordering_when_no_search(self) -> None:
        """ts_rank ordering must not appear when there is no search term."""
        sql = self._filter_sql(None, None)
        assert "ts_rank" not in sql.lower()
