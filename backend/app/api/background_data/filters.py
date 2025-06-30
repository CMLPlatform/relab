"""FastAPI-Filter schemas for filtering database queries on background data models."""

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.background_data.models import Category, Material, ProductType, Taxonomy


class TaxonomyFilter(Filter):
    """FastAPI-Filter for Taxonomy filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    source__ilike: str | None = None

    search: str | None = None

    # TODO: Add custom domain filtering (given a list of domains, return all taxonomies that have at least one of them).
    # See https://github.com/arthurio/fastapi-filter/issues/556 for inspiration. Or move to https://github.com/OleksandrZhydyk/FastAPI-SQLAlchemy-Filters.

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Taxonomy
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
            "source",
        ]


class CategoryFilter(Filter):
    """FastAPI-filter class for Category filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None

    search: str | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Category
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
        ]


class CategoryFilterWithRelationships(CategoryFilter):
    """FastAPI-filter class for Category filtering, with linked relationships."""

    # Linked relationships
    taxonomy: CategoryFilter | None = FilterDepends(with_prefix("taxonomy", CategoryFilter))


class MaterialFilter(Filter):
    """FastAPI-filter class for Material filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    density_kg_m3__gte: float | None = None
    density_kg_m3__lte: float | None = None
    is_crm: bool | None = None
    source__ilike: str | None = None

    search: str | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Material
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
            "source",
        ]


class MaterialFilterWithRelationships(MaterialFilter):
    """FastAPI-filter class for Material filtering, with linked relationships."""

    # Linked properties
    categories: CategoryFilter | None = FilterDepends(with_prefix("categories", CategoryFilter))


class ProductTypeFilter(Filter):
    """FastAPI-Filter class for ProductType filtering."""

    name__ilike: str | None = None
    description__ilike: str | None = None

    search: str | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = ProductType
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
        ]


class ProductTypeFilterWithRelationships(ProductTypeFilter):
    """FastAPI-filter class for ProductType filtering, with linked relationships."""

    # Linked properties
    categories: CategoryFilter | None = FilterDepends(with_prefix("categories", CategoryFilter))
