"""FastAPI-Filter classes for filtering database queries."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 # Runtime import is required for FastAPI-Filter field definitions
from typing import TYPE_CHECKING, Any, Literal, cast

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter
from pydantic import model_validator
from sqlalchemy import ColumnElement, Select, asc, desc, func, select

from app.api.background_data.filters import MaterialFilter, ProductTypeFilter
from app.api.common.search_utils import TSVectorSearchMixin, build_text_search_clause, ts_rank_expr
from app.api.data_collection.models.product import MaterialProductLink, Product

if TYPE_CHECKING:
    from sqlalchemy import Select


### Association Model Filters ###
class MaterialProductLinkFilter(Filter):
    """FastAPI-filter class for MaterialProductLink filtering."""

    quantity__gte: float | None = None
    quantity__lte: float | None = None
    unit_ilike: str | None = None

    # Linked properties
    material: MaterialFilter | None = FilterDepends(with_prefix("material", MaterialFilter))

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = MaterialProductLink


### Brand search helpers (kept here as they are product/brand-specific) ###

# Constants for ordering
ORDER_DESC: Literal["desc"] = "desc"


def get_brand_search_statement(search: str | None = None, order: Literal["asc", "desc"] = "asc") -> Select:
    """Return a SQLModel select statement for normalised, distinct brands with optional search and order."""
    brand_expr = func.trim(func.lower(Product.brand)).label("brand_norm")
    statement = select(brand_expr).where(cast("ColumnElement[Any]", Product.brand).is_not(None))
    if search:
        clause = build_text_search_clause(
            search.strip(),
            cast("ColumnElement[Any]", Product.search_vector),
            cast("ColumnElement[Any]", Product.brand),
        )
        statement = statement.where(clause)
    return statement.distinct().order_by(desc(brand_expr) if order == ORDER_DESC else asc(brand_expr))


### Product Filters ###

# 'rank' / '-rank' are virtual sort values understood by ProductFilter
# but not real Product columns.  They must be stripped before fastapi-filter's
# validate_order_by validator runs (which checks hasattr(model, field_name)).
_RANK_SORT_VALUES = frozenset(("rank", "-rank"))


class ProductFilter(TSVectorSearchMixin, Filter):
    """FastAPI-filter class for Product."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    brand__ilike: str | None = None
    brand__in: list[str] | None = None
    model__ilike: str | None = None
    dismantling_time_start__gte: datetime | None = None
    dismantling_time_start__lte: datetime | None = None
    dismantling_time_end__gte: datetime | None = None
    dismantling_time_end__lte: datetime | None = None
    created_at__gte: datetime | None = None
    created_at__lte: datetime | None = None
    updated_at__gte: datetime | None = None
    updated_at__lte: datetime | None = None

    search: str | None = None

    order_by: list[str] | None = None

    @model_validator(mode="before")
    @classmethod
    def _strip_rank_from_order_by(cls, data: object) -> object:
        """Remove 'rank'/'-rank' from order_by before fastapi-filter validates it.

        'rank' is a virtual sort token — it signals "order by ts_rank" but has no
        corresponding column on Product.  fastapi-filter's validate_order_by validator
        rejects unknown field names, so we strip the token here (mode="before") before
        that validator sees the value.

        FastAPI delivers query-param values as raw strings at this stage (before the
        split_str field_validator has run), so we must handle both str and list forms.

        When 'rank' is the *only* value the result becomes empty/None, which
        _apply_rank_ordering treats as "no explicit sort → apply ts_rank".
        """
        if not isinstance(data, dict):
            return data
        fields = cast("dict[str, Any]", data)
        raw = fields.get("order_by")
        if isinstance(raw, str):
            # Still a comma-separated string; split, strip rank, rejoin.
            items = [v.strip() for v in raw.split(",") if v.strip()]
            cleaned = [v for v in items if v not in _RANK_SORT_VALUES]
            fields["order_by"] = ",".join(cleaned) if cleaned else None
        elif isinstance(raw, list):
            cleaned = [v for v in raw if v not in _RANK_SORT_VALUES]
            fields["order_by"] = cleaned or None
        return fields

    @classmethod
    def _search_vector_col(cls) -> ColumnElement[Any]:
        return cast("ColumnElement[Any]", Product.search_vector)

    @classmethod
    def _trigram_cols(cls) -> list[Any]:
        return [Product.brand, Product.name]

    def _apply_rank_ordering(self, query: Select[Any], search: str) -> Select[Any]:
        """Apply ts_rank ordering when no explicit order_by is set.

        Because 'rank'/'- rank' is always stripped by _strip_rank_from_order_by before
        the instance is constructed, the only signal we need here is whether order_by
        is empty/None (user wants relevance) or has real fields (user chose an explicit sort).
        """
        if not (self.order_by or []):
            return query.order_by(ts_rank_expr(self._search_vector_col(), search))
        return query

    def sort(self, query: Any) -> Any:  # noqa: ANN401
        """Override of fastapi-filter's sort method.

        'rank' is already stripped at construction time, so this override is a no-op
        safety net in case order_by ends up empty after stripping.
        """
        if not self.order_by:
            return query
        return super().sort(query)  # type: ignore[misc]

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Product
        # search_model_fields intentionally omitted; search is handled by TSVectorSearchMixin
        # using tsvector + trigram indexes.


class ProductFilterWithRelationships(ProductFilter):
    """FastAPI-filter class for Product filtering with relationships."""

    weight_g__gte: float | None = None
    weight_g__lte: float | None = None
    height_cm__gte: float | None = None
    height_cm__lte: float | None = None
    width_cm__gte: float | None = None
    width_cm__lte: float | None = None
    depth_cm__gte: float | None = None
    depth_cm__lte: float | None = None

    product_type: ProductTypeFilter | None = FilterDepends(with_prefix("product_type", ProductTypeFilter))
