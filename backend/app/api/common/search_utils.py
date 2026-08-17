"""Shared utilities for PostgreSQL full-text (tsvector) and trigram search.

Usage in a filter class
-----------------------
1.  Add a ``search_vector`` computed column to the model (see
    ``app.api.data_collection.models.Product`` for the pattern).
2.  Implement ``search_vector_column`` and ``trigram_columns`` on the filter class.
3.  Let ``app.api.common.crud.filtering`` apply the search clause.

Example:
    class MyFilter(BaseFilterSet):
        @classmethod
        def search_vector_column(cls):
            return cast("ColumnElement[Any]", MyModel.search_vector)

        @classmethod
        def trigram_columns(cls):
            return [cast("SearchableColumn", MyModel.name)]
"""

from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_

type SearchableColumn = Any  # Column-like; typed loosely to avoid SA import coupling

LIKE_ESCAPE_CHAR = "\\"
_LIKE_WILDCARDS = str.maketrans({LIKE_ESCAPE_CHAR: LIKE_ESCAPE_CHAR * 2, "%": "\\%", "_": "\\_"})


# ─── Clause builders ──────────────────────────────────────────────────────────


def build_text_search_clause(
    search: str,
    search_vector_col: ColumnElement[Any],
    *trigram_fields: SearchableColumn,
) -> ColumnElement[bool]:
    """Return a WHERE clause combining tsvector @@ tsquery with optional trigram fuzzy matches.

    The trigram comparison runs against the bare column, never ``lower(column)``:
    the ``gin_trgm_ops`` indexes are built on the column itself, and an expression
    the index was not built on is an expression the planner cannot use it for.
    Folding case by hand would buy nothing anyway — pg_trgm lowercases text before
    it extracts trigrams, so ``'Drill' % 'drill'`` is already true.

    Args:
        search: The raw search string from the user.
        search_vector_col: The computed ``tsvector`` column on the model.
        *trigram_fields: Zero or more text columns to fuzzy-match with ``%`` (gin_trgm_ops).

    Returns:
        An OR-combined SQLAlchemy ``ColumnElement`` suitable for ``.where()``.
    """
    ts_query = func.websearch_to_tsquery("english", search)
    conditions: list[ColumnElement[bool]] = [search_vector_col.op("@@")(ts_query)]
    conditions.extend([field.op("%")(search) for field in trigram_fields])
    return or_(*conditions)


def build_contains_clause(search: str, *columns: SearchableColumn) -> ColumnElement[bool]:
    """Return a case-insensitive substring match across *columns*.

    LIKE wildcards in the user's input are escaped, so searching for ``%`` looks
    for a literal percent sign instead of matching every row in the table.
    """
    pattern = f"%{search.translate(_LIKE_WILDCARDS)}%"
    return or_(*[column.ilike(pattern, escape=LIKE_ESCAPE_CHAR) for column in columns])


def apply_ts_rank_ordering(query: Select[Any], search_vector_col: ColumnElement[Any], search: str) -> Select[Any]:
    """Order *query* by ``ts_rank`` DESC, safe for use with ``SELECT DISTINCT``.

    Postgres requires that every ORDER BY expression under ``SELECT DISTINCT``
    appears in the select list. We label the rank expression and add it to the
    select, then order by the label so the resulting SQL satisfies that rule.
    The extra column is computed per-row from the tsvector + search, so
    duplicate rows share the same rank and ``DISTINCT`` still collapses them.
    """
    rank = func.ts_rank(search_vector_col, func.websearch_to_tsquery("english", search)).label("ts_rank_score")
    return query.add_columns(rank).order_by(rank.desc())
