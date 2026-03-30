"""Shared utilities for PostgreSQL full-text (tsvector) and trigram search.

Usage in a Filter subclass
--------------------------
1.  Add a ``search_vector`` computed column to the model (see
    ``app.api.data_collection.models.Product`` for the pattern).
2.  Subclass ``TSVectorSearchMixin`` *before* ``Filter`` in the MRO.
3.  Implement ``_search_vector_col`` and ``_trigram_cols`` as classmethods.
4.  Remove ``search_model_fields`` from the inner ``Constants`` class so
    fastapi-filter does not generate its own ILIKE queries for ``search``.

Example:
    class MyFilter(TSVectorSearchMixin, Filter):
        search: str | None = None
        order_by: list[str] | None = None

        @classmethod
        def _search_vector_col(cls):
            return cast("ColumnElement[Any]", MyModel.search_vector)

        @classmethod
        def _trigram_cols(cls):
            return [cast("SearchableColumn", MyModel.name)]

        class Constants(Filter.Constants):
            model = MyModel
            # search_model_fields intentionally omitted
"""

# spell-checker: ignore trgm

from typing import TYPE_CHECKING, Any

from sqlalchemy import ColumnElement, Select, desc, func, or_

if TYPE_CHECKING:
    from fastapi_filter.contrib.sqlalchemy import Filter as _FilterBase
else:
    _FilterBase = object

type SearchableColumn = Any  # Column-like; typed loosely to avoid SA import coupling


# ─── Clause builders ──────────────────────────────────────────────────────────


def build_text_search_clause(
    search: str,
    search_vector_col: ColumnElement[Any],
    *trigram_fields: SearchableColumn,
) -> ColumnElement[bool]:
    """Return a WHERE clause combining tsvector @@ tsquery with optional trigram fuzzy matches.

    Args:
        search: The raw search string from the user.
        search_vector_col: The computed ``tsvector`` column on the model.
        *trigram_fields: Zero or more text columns to fuzzy-match with ``%`` (gin_trgm_ops).

    Returns:
        An OR-combined SQLAlchemy ``ColumnElement`` suitable for ``.where()``.
    """
    ts_query = func.websearch_to_tsquery("english", search)
    search_lower = search.lower()
    conditions: list[ColumnElement[bool]] = [search_vector_col.op("@@")(ts_query)]
    conditions.extend([func.lower(field).op("%")(search_lower) for field in trigram_fields])
    return or_(*conditions)


def ts_rank_expr(search_vector_col: ColumnElement[Any], search: str) -> ColumnElement[Any]:
    """Return a ``ts_rank(...).desc()`` ORDER BY expression."""
    return desc(func.ts_rank(search_vector_col, func.websearch_to_tsquery("english", search)))


# ─── Mixin ────────────────────────────────────────────────────────────────────


class TSVectorSearchMixin(_FilterBase):
    """Mixin that replaces fastapi-filter's default ILIKE ``search`` with tsvector + trigram.

    Must appear before ``Filter`` in the class MRO so that ``super().filter()``
    delegates to the real ``Filter.filter()`` after we have cleared ``self.search``.

    By default, ``ts_rank`` ordering is added whenever a search term is active.
    Subclasses may override ``_apply_rank_ordering`` to change this behaviour
    (e.g. ``ProductFilter`` only ranks by relevance when no explicit ``order_by``
    is requested, or when the caller passes ``order_by=rank``).
    """

    @classmethod
    def _search_vector_col(cls) -> ColumnElement[Any]:
        """Return the tsvector column for this model. Must be implemented by the subclass."""
        msg = f"{cls.__name__} must implement _search_vector_col()"
        raise NotImplementedError(msg)

    @classmethod
    def _trigram_cols(cls) -> list[SearchableColumn]:
        """Return the list of text columns to fuzzy-match with trigram similarity.

        Override in the subclass to enable trigram fallback on specific fields.
        """
        return []

    def _apply_rank_ordering(self, query: Select[Any], search: str) -> Select[Any]:
        """Append ``ts_rank`` ordering to *query*. Override to change the behaviour."""
        return query.order_by(ts_rank_expr(self._search_vector_col(), search))

    def filter(self, query: Any) -> Any:  # noqa: ANN401
        """Apply tsvector + trigram search, replacing fastapi-filter's default ILIKE logic."""
        search: str | None = getattr(self, "search", None)
        # Temporarily suppress self.search so fastapi-filter's super().filter()
        # does not try to apply it (we have intentionally omitted search_model_fields).
        object.__setattr__(self, "search", None)
        query = super().filter(query)
        object.__setattr__(self, "search", search)

        if search:
            clause = build_text_search_clause(search, self._search_vector_col(), *self._trigram_cols())
            query = query.where(clause)
            query = self._apply_rank_ordering(query, search)

        return query
