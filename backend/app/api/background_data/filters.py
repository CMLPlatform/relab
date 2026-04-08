"""FastAPI-Filter schemas for filtering database queries on background data models."""

from typing import Any, cast

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter
from sqlalchemy import ColumnElement

from app.api.background_data.models import Category, Material, ProductType, Taxonomy
from app.api.common.search_utils import TSVectorSearchMixin


class TaxonomyFilter(Filter):
    """FastAPI-Filter for Taxonomy filtering."""

    name__ilike: str | None = None
    version__ilike: str | None = None
    description__ilike: str | None = None
    source__ilike: str | None = None

    search: str | None = None

    order_by: list[str] | None = None

    # TODO: Add custom domain filtering (given a list of domains, return all taxonomies that have at least one of them).
    # See https://github.com/arthurio/fastapi-filter/issues/556 for inspiration. Or move to https://github.com/OleksandrZhydyk/FastAPI-SQLAlchemy-Filters.

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Taxonomy
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
            "version",
        ]


class CategoryFilter(TSVectorSearchMixin, Filter):
    """FastAPI-filter class for Category filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    external_id__ilike: str | None = None

    search: str | None = None

    order_by: list[str] | None = None

    @classmethod
    def _search_vector_col(cls) -> ColumnElement[Any]:
        return cast("ColumnElement[Any]", Category.search_vector)

    @classmethod
    def _trigram_cols(cls) -> list[Any]:
        return [Category.name]

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Category
        # search_model_fields intentionally omitted; handled by TSVectorSearchMixin


class CategoryFilterWithRelationships(CategoryFilter):
    """FastAPI-filter class for Category filtering, with linked relationships."""

    # Linked relationships
    taxonomy: TaxonomyFilter | None = FilterDepends(with_prefix("taxonomy", TaxonomyFilter))


class MaterialFilter(TSVectorSearchMixin, Filter):
    """FastAPI-filter class for Material filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    density_kg_m3__gte: float | None = None
    density_kg_m3__lte: float | None = None
    is_crm: bool | None = None
    source__ilike: str | None = None

    search: str | None = None

    order_by: list[str] | None = None

    @classmethod
    def _search_vector_col(cls) -> ColumnElement[Any]:
        return cast("ColumnElement[Any]", Material.search_vector)

    @classmethod
    def _trigram_cols(cls) -> list[Any]:
        return [Material.name]

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Material
        # search_model_fields intentionally omitted; handled by TSVectorSearchMixin


class MaterialFilterWithRelationships(MaterialFilter):
    """FastAPI-filter class for Material filtering, with linked relationships."""

    # Linked properties
    categories: CategoryFilter | None = FilterDepends(with_prefix("categories", CategoryFilter))


class ProductTypeFilter(TSVectorSearchMixin, Filter):
    """FastAPI-Filter class for ProductType filtering."""

    name__ilike: str | None = None
    name__in: list[str] | None = None
    description__ilike: str | None = None

    search: str | None = None

    order_by: list[str] | None = None

    @classmethod
    def _search_vector_col(cls) -> ColumnElement[Any]:
        return cast("ColumnElement[Any]", ProductType.search_vector)

    @classmethod
    def _trigram_cols(cls) -> list[Any]:
        return [ProductType.name]

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = ProductType
        # search_model_fields intentionally omitted; handled by TSVectorSearchMixin


class ProductTypeFilterWithRelationships(ProductTypeFilter):
    """FastAPI-filter class for ProductType filtering, with linked relationships."""

    # Linked properties
    categories: CategoryFilter | None = FilterDepends(with_prefix("categories", CategoryFilter))
