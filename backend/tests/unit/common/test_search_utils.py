"""Unit tests for the shared tsvector search utilities."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import literal_column
from sqlalchemy.dialects import postgresql

from app.api.common.search_utils import build_text_search_clause, ts_rank_expr

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ClauseElement


def _sql(clause: ClauseElement) -> str:
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


_SEARCH_VECTOR = literal_column("material.search_vector")
_NAME_COL = literal_column("material.name")
_DESC_COL = literal_column("material.description")


class TestBuildTextSearchClause:
    """Tests for build_text_search_clause."""

    def test_tsvector_only_produces_one_condition(self) -> None:
        """No trigram fields → single tsvector @@ tsquery condition."""
        clause = build_text_search_clause("test", _SEARCH_VECTOR)
        sql = _sql(clause)
        assert "@@" in sql
        assert " OR " not in sql.upper()

    def test_one_trigram_field_produces_two_conditions(self) -> None:
        """One trigram field → tsvector condition + one trigram condition."""
        clause = build_text_search_clause("test", _SEARCH_VECTOR, _NAME_COL)
        assert len(list(clause.clauses)) == 2

    def test_two_trigram_fields_produce_three_conditions(self) -> None:
        """Two trigram fields → tsvector condition + two trigram conditions."""
        clause = build_text_search_clause("test", _SEARCH_VECTOR, _NAME_COL, _DESC_COL)
        assert len(list(clause.clauses)) == 3

    def test_contains_tsvector_match_operator(self) -> None:
        """Clause should contain the tsvector match operator (@@)."""
        sql = _sql(build_text_search_clause("hello", _SEARCH_VECTOR, _NAME_COL))
        assert "@@" in sql

    def test_uses_websearch_to_tsquery(self) -> None:
        """Clause should use websearch_to_tsquery for the tsquery."""
        sql = _sql(build_text_search_clause("hello world", _SEARCH_VECTOR))
        assert "websearch_to_tsquery" in sql

    def test_trigram_operator_present_for_given_field(self) -> None:
        """Clause should contain the trigram operator (%) for the name field."""
        sql = _sql(build_text_search_clause("hello", _SEARCH_VECTOR, _NAME_COL))
        assert "%" in sql
        assert "material.name" in sql.lower()

    def test_absent_field_not_in_sql(self) -> None:
        """If a trigram field isn't given, it shouldn't appear in the SQL."""
        sql = _sql(build_text_search_clause("hello", _SEARCH_VECTOR, _NAME_COL))
        assert "material.description" not in sql.lower()

    def test_search_lowercased_for_trigram(self) -> None:
        """Trigram comparisons use lower() to normalise case."""
        sql = _sql(build_text_search_clause("Hello", _SEARCH_VECTOR, _NAME_COL))
        assert "lower" in sql.lower()

    def test_conditions_combined_with_or(self) -> None:
        """Multiple conditions are OR-combined, not AND."""
        sql = _sql(build_text_search_clause("x", _SEARCH_VECTOR, _NAME_COL))
        assert " OR " in sql.upper()


class TestTsRankExpr:
    """Tests for ts_rank_expr."""

    def test_ts_rank_expression_structure(self) -> None:
        """ts_rank_expr produces a ts_rank(…, websearch_to_tsquery(…)) DESC expression."""
        sql = _sql(ts_rank_expr(_SEARCH_VECTOR, "hello world"))
        assert "ts_rank" in sql.lower()
        assert "websearch_to_tsquery" in sql
        assert "DESC" in sql.upper()
