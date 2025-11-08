"""FastAPI-Filter classes for filtering database queries."""

from datetime import datetime

from fastapi_filter import FilterDepends, with_prefix
from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.background_data.filters import MaterialFilter, ProductTypeFilter
from app.api.common.models.associations import MaterialProductLink
from app.api.data_collection.models import PhysicalProperties, Product


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

    weight_kg__gte: float | None = None
    weight_kg__lte: float | None = None
    height_cm__gte: float | None = None
    height_cm__lte: float | None = None
    width_cm__gte: float | None = None
    width_cm__lte: float | None = None
    depth_cm__gte: float | None = None
    depth_cm__lte: float | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = PhysicalProperties


## Product Filters ##
class ProductFilter(Filter):
    """FastAPI-filter class for Product."""

    name__ilike: str | None = None
    description__ilike: str | None = None
    brand__ilike: str | None = None
    model__ilike: str | None = None
    dismantling_time_start__gte: datetime | None = None
    dismantling_time_start__lte: datetime | None = None
    dismantling_time_end__gte: datetime | None = None
    dismantling_time_end__lte: datetime | None = None
    created_at__gte: datetime | None = None
    created_at__lte: datetime | None = None
    updated_at__gte: datetime | None = None
    updated_at__lte: datetime | None = None
    order_by: list[str] | None = None

    search: str | None = None

    class Constants(Filter.Constants):
        """FilterAPI class configuration."""

        model = Product
        search_model_fields: list[str] = [  # noqa: RUF012 # Standard FastAPI-filter class override
            "name",
            "description",
            "brand",
            "model",
        ]


class ProductFilterWithRelationships(ProductFilter):
    """FastAPI-filter class for Product filtering with relationships."""

    physical_properties: PhysicalPropertiesFilter | None = FilterDepends(
        with_prefix("physical_properties", PhysicalPropertiesFilter)
    )
    product_type: ProductTypeFilter | None = FilterDepends(with_prefix("product_type", ProductTypeFilter))
