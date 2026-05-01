"""Filter classes and search helpers for data collection queries."""

from __future__ import annotations

from datetime import datetime  # Runtime import is required for FastAPI filter field definitions
from typing import Any, ClassVar, Literal  # Runtime import required by fastapi-filters get_type_hints

from fastapi_filters import FilterField, FilterOperator
from sqlalchemy import ColumnElement, Select, asc, desc, func, select

from app.api.common.crud.filtering import BaseFilterSet, RelationshipFilterJoin
from app.api.common.sa_typing import column_expr
from app.api.common.search_utils import build_text_search_clause
from app.api.common.validation import normalize_bounded_query_text
from app.api.data_collection.models.product import MaterialProductLink, Product
from app.api.reference_data.filters import MaterialFilter, ProductTypeFilter
from app.api.reference_data.models import Material, ProductType

_TEXT_OPERATORS = [FilterOperator.ilike]
_TEXT_IN_OPERATORS = [FilterOperator.ilike, FilterOperator.in_]
_RANGE_OPERATORS = [FilterOperator.ge, FilterOperator.le]


class MaterialProductLinkFilter(BaseFilterSet):
    """FilterSet for MaterialProductLink filtering."""

    filter_model: ClassVar[type[MaterialProductLink]] = MaterialProductLink
    relationship_joins: ClassVar[tuple[RelationshipFilterJoin, ...]] = (
        RelationshipFilterJoin("material_name", (MaterialProductLink.material,), Material.name),
        RelationshipFilterJoin("material_description", (MaterialProductLink.material,), Material.description),
        RelationshipFilterJoin("material_source", (MaterialProductLink.material,), Material.source),
    )

    quantity: FilterField[float] = FilterField(operators=_RANGE_OPERATORS)
    unit: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    material_name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    material_description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    material_source: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)


# Brand search helpers (kept here as they are product/brand-specific)
ORDER_DESC: Literal["desc"] = "desc"


def _normalized_text_field(field: ColumnElement[str]) -> ColumnElement[str]:
    """Return a normalized non-empty text expression for product helper queries."""
    return func.trim(func.lower(field))


def _product_text_field_statement(
    field: ColumnElement[str],
    *,
    search: str | None = None,
    order: Literal["asc", "desc"] = "asc",
) -> Select[tuple[str]]:
    field_expr = _normalized_text_field(field).label("field_norm")
    statement = select(field_expr).where(field.is_not(None), field_expr != "")
    search = normalize_bounded_query_text(search)
    if search is not None:
        clause = build_text_search_clause(
            search,
            column_expr(Product.search_vector),
            field,
        )
        statement = statement.where(clause)
    return statement.distinct().order_by(desc(field_expr) if order == ORDER_DESC else asc(field_expr))


def get_brand_search_statement(search: str | None = None, order: Literal["asc", "desc"] = "asc") -> Select[tuple[str]]:
    """Return a select statement for normalised, distinct brands with optional search and order."""
    return _product_text_field_statement(column_expr(Product.brand), search=search, order=order)


def get_model_search_statement(search: str | None = None, order: Literal["asc", "desc"] = "asc") -> Select[tuple[str]]:
    """Return a select statement for normalised, distinct model names with optional search and order."""
    return _product_text_field_statement(column_expr(Product.model), search=search, order=order)


def get_product_facet_statement(field_name: Literal["brand", "model"]) -> Select[tuple[str, int]]:
    """Return a grouped product facet statement for a derived text field."""
    field = column_expr(getattr(Product, field_name))
    field_expr = _normalized_text_field(field).label("value")
    count_expr = func.count(Product.id).label("count")
    return (
        select(field_expr, count_expr)
        .where(field.is_not(None), field_expr != "")
        .group_by(field_expr)
        .order_by(desc(count_expr), asc(field_expr))
    )


class ProductFilter(BaseFilterSet):
    """FilterSet for Product."""

    filter_model: ClassVar[type[Product]] = Product
    sortable_fields: ClassVar[tuple[str, ...]] = ("name", "brand", "model", "created_at", "updated_at")

    name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    brand: FilterField[str] = FilterField(operators=_TEXT_IN_OPERATORS)
    model: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    created_at: FilterField[datetime] = FilterField(operators=_RANGE_OPERATORS)
    updated_at: FilterField[datetime] = FilterField(operators=_RANGE_OPERATORS)

    @classmethod
    def search_vector_column(cls) -> ColumnElement[Any]:
        """Return the product search-vector column."""
        return column_expr(Product.search_vector)

    @classmethod
    def trigram_columns(cls) -> list[Any]:
        """Return product text columns used for trigram fallback."""
        return [Product.brand, Product.name]


class ProductFilterWithRelationships(ProductFilter):
    """Product filters with explicit relationship-backed fields."""

    sortable_fields: ClassVar[tuple[str, ...]] = (*ProductFilter.sortable_fields, "product_type_name")
    relationship_joins: ClassVar[tuple[RelationshipFilterJoin, ...]] = (
        RelationshipFilterJoin("product_type_name", (Product.product_type,), ProductType.name),
        RelationshipFilterJoin("product_type_description", (Product.product_type,), ProductType.description),
    )

    weight_g: FilterField[float] = FilterField(operators=_RANGE_OPERATORS)
    height_cm: FilterField[float] = FilterField(operators=_RANGE_OPERATORS)
    width_cm: FilterField[float] = FilterField(operators=_RANGE_OPERATORS)
    depth_cm: FilterField[float] = FilterField(operators=_RANGE_OPERATORS)
    product_type_name: FilterField[str] = FilterField(operators=_TEXT_IN_OPERATORS)
    product_type_description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)


__all__ = [
    "MaterialFilter",
    "MaterialProductLinkFilter",
    "ProductFilter",
    "ProductFilterWithRelationships",
    "ProductTypeFilter",
    "get_brand_search_statement",
    "get_model_search_statement",
    "get_product_facet_statement",
]
