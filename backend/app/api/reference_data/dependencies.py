"""Router dependencies for reference data routers."""

from typing import Annotated

from fastapi import Depends

from app.api.common.crud.filtering import create_filter_dependency
from app.api.reference_data.filters import (
    CategoryFilter,
    CategoryFilterWithRelationships,
    MaterialFilterWithRelationships,
    ProductTypeFilterWithRelationships,
    TaxonomyFilter,
)

### Query filters ###
CategoryFilterDep = Annotated[CategoryFilter, Depends(create_filter_dependency(CategoryFilter))]
CategoryFilterWithRelationshipsDep = Annotated[
    CategoryFilterWithRelationships, Depends(create_filter_dependency(CategoryFilterWithRelationships))
]
TaxonomyFilterDep = Annotated[TaxonomyFilter, Depends(create_filter_dependency(TaxonomyFilter))]
MaterialFilterWithRelationshipsDep = Annotated[
    MaterialFilterWithRelationships, Depends(create_filter_dependency(MaterialFilterWithRelationships))
]
ProductTypeFilterWithRelationshipsDep = Annotated[
    ProductTypeFilterWithRelationships, Depends(create_filter_dependency(ProductTypeFilterWithRelationships))
]
