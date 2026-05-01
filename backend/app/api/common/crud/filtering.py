"""Filtering integration boundary for CRUD queries."""
# spell-checker: ignore isouter

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, ClassVar, Self, cast

from fastapi import Depends, Query
from fastapi_filters import FilterOperator, FilterSet, SortingValues, create_sorting
from fastapi_filters.ext.sqlalchemy import apply_filters as apply_fastapi_filters
from fastapi_filters.ext.sqlalchemy import apply_sorting
from pydantic import TypeAdapter
from sqlalchemy import ColumnElement, Select, or_
from sqlalchemy.orm.attributes import InstrumentedAttribute

from app.api.common.models.custom_types import MT
from app.api.common.search_utils import apply_ts_rank_ordering, build_text_search_clause
from app.api.common.validation import BoundedQueryText, BoundedQueryTextList

if TYPE_CHECKING:
    from collections.abc import Callable

_QUERY_TEXT_ADAPTER = TypeAdapter(BoundedQueryText)


@dataclass(frozen=True)
class RelationshipFilterJoin:
    """Explicit join metadata for a relationship-backed public filter field."""

    field: str
    joins: tuple[InstrumentedAttribute[Any], ...]
    column: ColumnElement[Any] | InstrumentedAttribute[Any]
    isouter: bool = False


class BaseFilterSet(FilterSet):
    """Base FilterSet with RELab-specific search, sorting, and join metadata."""

    filter_model: ClassVar[type[Any]]
    relationship_joins: ClassVar[tuple[RelationshipFilterJoin, ...]] = ()
    sortable_fields: ClassVar[tuple[str, ...]] = ()
    search_columns: ClassVar[tuple[ColumnElement[Any] | InstrumentedAttribute[Any], ...]] = ()

    _search: str | None = None
    _sorting: SortingValues | None = None

    @classmethod
    def __filter_field_adapt_type__(cls, _field: object, tp: type[Any], op: FilterOperator) -> object | None:
        """Apply shared query bounds to generated FastAPI filter parameters."""
        if tp is str:
            if op in {FilterOperator.in_, FilterOperator.not_in}:
                return BoundedQueryTextList
            return BoundedQueryText
        return None

    @property
    def search(self) -> str | None:
        """Normalized free-text search term, separate from structured FilterSet fields."""
        return self._search

    @property
    def sorting(self) -> SortingValues:
        """Parsed sorting values."""
        return self._sorting or []

    def with_search(self, search: str | None) -> Self:
        """Attach normalized free-text search to this filter set."""
        self._search = _QUERY_TEXT_ADAPTER.validate_python(search)
        return self

    def with_sorting(self, sorting: SortingValues | None) -> Self:
        """Attach parsed sorting values from fastapi-filters."""
        self._sorting = sorting or []
        return self

    @classmethod
    def search_vector_column(cls) -> ColumnElement[Any]:
        """Return the tsvector column for this filter, when search is supported."""
        msg = f"{cls.__name__} must implement search_vector_column()"
        raise NotImplementedError(msg)

    @classmethod
    def trigram_columns(cls) -> list[Any]:
        """Return text columns used for trigram fallback search."""
        return []

    def build_search_clause(self) -> ColumnElement[bool] | None:
        """Build the free-text search clause for this filter."""
        if not self.search:
            return None
        if self.search_columns:
            return or_(*[column.ilike(f"%{self.search}%") for column in self.search_columns])
        return build_text_search_clause(
            self.search,
            self.search_vector_column(),
            *self.trigram_columns(),
        )

    def should_apply_rank_ordering(self) -> bool:
        """Return whether active search should add ts_rank ordering."""
        return bool(self.search and not self.search_columns and not self.sorting)


def _relationship_join_lookup(model_filter: BaseFilterSet) -> dict[str, RelationshipFilterJoin]:
    return {join.field: join for join in model_filter.relationship_joins}


def _relationship_columns(model_filter: BaseFilterSet) -> dict[str, ColumnElement[Any] | InstrumentedAttribute[Any]]:
    return {join.field: join.column for join in model_filter.relationship_joins}


def _apply_relationship_joins(statement: Select[tuple[MT]], model_filter: BaseFilterSet) -> Select[tuple[MT]]:
    active_fields = {*model_filter.filter_values, *(field for field, _direction, _nulls in model_filter.sorting)}
    join_lookup = _relationship_join_lookup(model_filter)
    applied: set[InstrumentedAttribute[Any]] = set()

    for field in active_fields:
        join = join_lookup.get(field)
        if join is None:
            continue
        for relationship in join.joins:
            if relationship in applied:
                continue
            statement = statement.join(relationship, isouter=join.isouter)
            applied.add(relationship)
    return statement


def apply_filter(
    statement: Select[tuple[MT]],
    _model: type[MT],
    model_filter: BaseFilterSet | None,
) -> Select[tuple[MT]]:
    """Apply RELab FilterSet filtering, explicit relationship joins, search, and sorting."""
    if model_filter is None:
        return statement

    statement = _apply_relationship_joins(statement, model_filter)
    statement = cast(
        "Select[tuple[MT]]",
        apply_fastapi_filters(
            statement,
            model_filter,
            additional=_relationship_columns(model_filter),
        ),
    )

    search_clause = model_filter.build_search_clause()
    if search_clause is not None:
        statement = statement.where(search_clause)

    if model_filter.search and model_filter.should_apply_rank_ordering():
        statement = apply_ts_rank_ordering(statement, model_filter.search_vector_column(), model_filter.search)

    if model_filter.sorting:
        statement = cast(
            "Select[tuple[MT]]",
            apply_sorting(statement, model_filter.sorting, additional=_relationship_columns(model_filter)),
        )
    return statement


def create_filter_dependency(
    filter_cls: type[BaseFilterSet],
) -> Callable[..., BaseFilterSet]:
    """Create a FastAPI dependency returning a configured RELab filter set."""
    if not filter_cls.sortable_fields:

        def dependency_without_sorting(
            filters: BaseFilterSet = Depends(filter_cls),
            search: BoundedQueryText = Query(default=None),
        ) -> BaseFilterSet:
            return filters.with_search(search).with_sorting([])

        return dependency_without_sorting

    sorting_dependency = create_sorting(*filter_cls.sortable_fields, alias="order_by")

    def dependency(
        filters: BaseFilterSet = Depends(filter_cls),
        search: BoundedQueryText = Query(default=None),
        sorting: SortingValues = Depends(sorting_dependency),
    ) -> BaseFilterSet:
        return filters.with_search(search).with_sorting(sorting)

    return dependency
