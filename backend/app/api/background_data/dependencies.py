"""Router dependencies for background data routers."""

from typing import Annotated

from fastapi_filter import FilterDepends

from app.api.background_data.filters import (
    CategoryFilter,
    CategoryFilterWithRelationships,
    MaterialFilterWithRelationships,
    ProductTypeFilterWithRelationships,
    TaxonomyFilter,
)

### FastAPI-Filters ###
CategoryFilterDep = Annotated[CategoryFilter, FilterDepends(CategoryFilter)]
CategoryFilterWithRelationshipsDep = Annotated[
    CategoryFilterWithRelationships, FilterDepends(CategoryFilterWithRelationships)
]
TaxonomyFilterDep = Annotated[TaxonomyFilter, FilterDepends(TaxonomyFilter)]
MaterialFilterWithRelationshipsDep = Annotated[
    MaterialFilterWithRelationships, FilterDepends(MaterialFilterWithRelationships)
]
ProductTypeFilterWithRelationshipsDep = Annotated[
    ProductTypeFilterWithRelationships, FilterDepends(ProductTypeFilterWithRelationships)
]
