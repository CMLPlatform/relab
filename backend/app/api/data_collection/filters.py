"""FastAPI-Filter classes for filtering database queries."""

from datetime import datetime  # noqa: TC003 # Runtime import is required for FastAPI-Filter field definitions
from typing import TYPE_CHECKING

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter
from sqlalchemy import desc, func, literal_column, or_
from sqlmodel import col, select

from app.api.background_data.filters import MaterialFilter, ProductTypeFilter
from app.api.data_collection.models import MaterialProductLink, PhysicalProperties, Product

if TYPE_CHECKING:
    from typing import Any

    from sqlalchemy import ColumnElement, Select


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


## Physical Properties Filters ##
class PhysicalPropertiesFilter(Filter):
    """FastAPI-filter class for Physical Properties filtering."""

    weight_g__gte: float | None = None
    weight_g__lte: float | None = None
    height_cm__gte: float | None = None
    height_cm__lte: float | None = None
    width_cm__gte: float | None = None
    width_cm__lte: float | None = None
    depth_cm__gte: float | None = None
    depth_cm__lte: float | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = PhysicalProperties


### TS Vector Search Filter for Product ###


def build_product_search_clause(
    search: str,
    brand_field,  # noqa: ANN001 — accepts InstrumentedAttribute or ColumnClause; no public SQLAlchemy union type covers both
    search_vector_col,  # noqa: ANN001
    name_field=None,  # noqa: ANN001
) -> ColumnElement[bool]:
    """Reusable WHERE clause for searching products (tsvector + trigram on brand, optionally name)."""
    ts_query = func.websearch_to_tsquery("english", search)
    conditions = [search_vector_col.op("@@")(ts_query), col(brand_field).op("%")(search)]
    if name_field is not None:
        conditions.append(col(name_field).op("%")(search))
    return or_(*conditions)


def build_brand_search_clause(search: str) -> ColumnElement[bool]:
    """Reusable WHERE clause for searching brands (tsvector + trigram)."""
    return build_product_search_clause(search, Product.brand, literal_column("product.search_vector"))


def get_brand_search_statement(search: str | None = None, order: str = "asc") -> Select:
    """Return a SQLModel select statement for normalized, distinct brands with optional search and order."""
    brand_expr = func.trim(func.lower(Product.brand)).label("brand_norm")
    statement = select(brand_expr).where(col(Product.brand).is_not(None))
    if search:
        statement = statement.where(build_brand_search_clause(search.strip()))
    return statement.distinct().order_by(desc(brand_expr) if order == "desc" else brand_expr)  # noqa: PLR2004


### Product Filters ###
class ProductFilter(Filter):
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

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Product
        # search_model_fields intentionally omitted — search is handled by the
        # overridden filter() method below using tsvector + trigram indexes.

    def filter(self, query: Any) -> Any:  # noqa: ANN401
        """Apply filters, replacing the default ILIKE search with tsvector + trigram search."""
        # Temporarily clear search before delegating to super() — fastapi-filter would otherwise
        # try getattr(Product, 'search') and raise AttributeError since we removed search_model_fields.
        search = self.search
        object.__setattr__(self, "search", None)
        query = super().filter(query)
        object.__setattr__(self, "search", search)

        if self.search:
            clause = build_product_search_clause(
                self.search, Product.brand, literal_column("product.search_vector"), name_field=Product.name
            )
            query = query.where(clause).order_by(
                func.ts_rank(
                    literal_column("product.search_vector"), func.websearch_to_tsquery("english", self.search)
                ).desc()
            )

        return query


class ProductFilterWithRelationships(ProductFilter):
    """FastAPI-filter class for Product filtering with relationships."""

    physical_properties: PhysicalPropertiesFilter | None = FilterDepends(
        with_prefix("physical_properties", PhysicalPropertiesFilter)
    )
    product_type: ProductTypeFilter | None = FilterDepends(with_prefix("product_type", ProductTypeFilter))
