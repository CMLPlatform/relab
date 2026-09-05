"""Unit tests for the shared tsvector search utilities."""

from typing import TYPE_CHECKING

from sqlalchemy import literal_column, select
from sqlalchemy.dialects import postgresql

from app.api.common.search_utils import apply_ts_rank_ordering, build_contains_clause, build_text_search_clause

if TYPE_CHECKING:
    from sqlalchemy.sql.elements import ClauseElement


def _sql(clause: ClauseElement) -> str:
    """Compile a clause to a SQL string using the PostgreSQL dialect."""
    return str(clause.compile(dialect=postgresql.dialect()))


def _compiled(clause: ClauseElement) -> object:
    """Compile a clause for assertions on SQL text and bound parameters."""
    return clause.compile(dialect=postgresql.dialect())


_SEARCH_VECTOR = literal_column("material.search_vector")
_NAME_COL = literal_column("material.name")
_DESC_COL = literal_column("material.description")


def test_tsvector_only_produces_one_condition() -> None:
    """No trigram fields → single tsvector @@ tsquery condition."""
    clause = build_text_search_clause("test", _SEARCH_VECTOR)
    sql = _sql(clause)
    assert "@@" in sql
    assert " OR " not in sql.upper()


def test_one_trigram_field_produces_two_conditions() -> None:
    """One trigram field → tsvector condition + one trigram condition."""
    clause = build_text_search_clause("test", _SEARCH_VECTOR, _NAME_COL)
    assert len(list(clause.clauses)) == 2


def test_two_trigram_fields_produce_three_conditions() -> None:
    """Two trigram fields → tsvector condition + two trigram conditions."""
    clause = build_text_search_clause("test", _SEARCH_VECTOR, _NAME_COL, _DESC_COL)
    assert len(list(clause.clauses)) == 3


def test_uses_websearch_to_tsquery() -> None:
    """Clause should use websearch_to_tsquery for the tsquery."""
    sql = _sql(build_text_search_clause("hello world", _SEARCH_VECTOR))
    assert "websearch_to_tsquery" in sql


def test_trigram_operator_present_for_given_field() -> None:
    """Clause should contain the trigram operator (%) for the name field."""
    sql = _sql(build_text_search_clause("hello", _SEARCH_VECTOR, _NAME_COL))
    assert "%" in sql
    assert "material.name" in sql.lower()


def test_absent_field_not_in_sql() -> None:
    """If a trigram field isn't given, it shouldn't appear in the SQL."""
    sql = _sql(build_text_search_clause("hello", _SEARCH_VECTOR, _NAME_COL))
    assert "material.description" not in sql.lower()


def test_trigram_compares_the_bare_column() -> None:
    """Trigram comparisons must not wrap the column in a function.

    The gin_trgm_ops indexes are built on the column itself, so lower(column)
    is an expression the planner cannot match to one — it would silently
    downgrade every fuzzy search to a sequential scan. pg_trgm already folds
    case when it extracts trigrams, so there is nothing to normalise.
    """
    sql = _sql(build_text_search_clause("Hello", _SEARCH_VECTOR, _NAME_COL))
    assert "lower(material.name)" not in sql.lower()


def test_conditions_combined_with_or() -> None:
    """Multiple conditions are OR-combined, not AND."""
    sql = _sql(build_text_search_clause("x", _SEARCH_VECTOR, _NAME_COL))
    assert " OR " in sql.upper()


def test_search_text_is_bound_not_concatenated_into_sql() -> None:
    """User search text must remain a bound value, not SQL source text."""
    search = "x'); DROP TABLE product; --"
    compiled = _compiled(build_text_search_clause(search, _SEARCH_VECTOR, _NAME_COL))
    sql = str(compiled)

    assert search not in sql
    assert search in compiled.params.values()


def test_contains_clause_escapes_like_wildcards() -> None:
    """A user searching for % or _ looks for those characters, not for every row."""
    compiled = _compiled(build_contains_clause("50%_off", _NAME_COL))
    assert r"%50\%\_off%" in compiled.params.values()


def test_contains_clause_escapes_the_escape_character() -> None:
    """A literal backslash must not turn the next character into an escape."""
    compiled = _compiled(build_contains_clause("back\\slash", _NAME_COL))
    assert "%back\\\\slash%" in compiled.params.values()


def test_contains_clause_matches_each_column_case_insensitively() -> None:
    """Every named column is OR-matched with ILIKE."""
    sql = _sql(build_contains_clause("x", _NAME_COL, _DESC_COL))
    assert sql.count("ILIKE") == 2
    assert " OR " in sql.upper()


def test_adds_rank_column_and_orders_by_it() -> None:
    """Rank is added to the select list and used as the ORDER BY target.

    This satisfies Postgres' rule that ORDER BY expressions under
    SELECT DISTINCT must appear in the select list.
    """
    base = select(_NAME_COL)
    sql = _sql(apply_ts_rank_ordering(base, _SEARCH_VECTOR, "hello world"))
    assert "ts_rank" in sql.lower()
    assert "websearch_to_tsquery" in sql
    assert "ts_rank_score" in sql
    assert "ORDER BY" in sql.upper()
    assert "DESC" in sql.upper()
