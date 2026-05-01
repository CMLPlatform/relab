"""Filter schemas for reference data database queries."""

from typing import Any, ClassVar  # Runtime import required by fastapi-filters get_type_hints

from fastapi_filters import FilterField, FilterOperator
from sqlalchemy import ColumnElement

from app.api.common.crud.filtering import BaseFilterSet, RelationshipFilterJoin
from app.api.common.sa_typing import column_expr
from app.api.reference_data.models import Category, Material, ProductType, Taxonomy

_TEXT_OPERATORS = [FilterOperator.ilike]
_TEXT_IN_OPERATORS = [FilterOperator.ilike, FilterOperator.in_]


class TaxonomyFilter(BaseFilterSet):
    """FilterSet for Taxonomy filtering."""

    filter_model: ClassVar[type[Taxonomy]] = Taxonomy
    sortable_fields: ClassVar[tuple[str, ...]] = ("name", "version", "source")
    search_columns: ClassVar[tuple[Any, ...]] = (Taxonomy.name, Taxonomy.description, Taxonomy.version)

    name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    version: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    source: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)


class CategoryFilter(BaseFilterSet):
    """FilterSet for Category filtering."""

    filter_model: ClassVar[type[Category]] = Category
    sortable_fields: ClassVar[tuple[str, ...]] = ("name", "external_id")

    name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    external_id: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)

    @classmethod
    def search_vector_column(cls) -> ColumnElement[Any]:
        """Return the category search-vector column."""
        return column_expr(Category.search_vector)

    @classmethod
    def trigram_columns(cls) -> list[Any]:
        """Return category text columns used for trigram fallback."""
        return [Category.name]


class CategoryFilterWithRelationships(CategoryFilter):
    """Category filters with explicit relationship-backed fields."""

    sortable_fields: ClassVar[tuple[str, ...]] = (*CategoryFilter.sortable_fields, "taxonomy_name")
    relationship_joins: ClassVar[tuple[RelationshipFilterJoin, ...]] = (
        RelationshipFilterJoin("taxonomy_name", (Category.taxonomy,), Taxonomy.name),
        RelationshipFilterJoin("taxonomy_version", (Category.taxonomy,), Taxonomy.version),
        RelationshipFilterJoin("taxonomy_description", (Category.taxonomy,), Taxonomy.description),
        RelationshipFilterJoin("taxonomy_source", (Category.taxonomy,), Taxonomy.source),
    )

    taxonomy_name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    taxonomy_version: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    taxonomy_description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    taxonomy_source: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)


class MaterialFilter(BaseFilterSet):
    """FilterSet for Material filtering."""

    filter_model: ClassVar[type[Material]] = Material
    sortable_fields: ClassVar[tuple[str, ...]] = ("name", "density_kg_m3", "source")

    name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    density_kg_m3: FilterField[float] = FilterField(operators=[FilterOperator.ge, FilterOperator.le])
    is_crm: FilterField[bool] = FilterField(operators=[FilterOperator.eq])
    source: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)

    @classmethod
    def search_vector_column(cls) -> ColumnElement[Any]:
        """Return the material search-vector column."""
        return column_expr(Material.search_vector)

    @classmethod
    def trigram_columns(cls) -> list[Any]:
        """Return material text columns used for trigram fallback."""
        return [Material.name]


class MaterialFilterWithRelationships(MaterialFilter):
    """Material filters with explicit relationship-backed fields."""

    sortable_fields: ClassVar[tuple[str, ...]] = (*MaterialFilter.sortable_fields, "category_name")
    relationship_joins: ClassVar[tuple[RelationshipFilterJoin, ...]] = (
        RelationshipFilterJoin("category_name", (Material.categories,), Category.name),
        RelationshipFilterJoin("category_description", (Material.categories,), Category.description),
        RelationshipFilterJoin("category_external_id", (Material.categories,), Category.external_id),
    )

    category_name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    category_description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    category_external_id: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)


class ProductTypeFilter(BaseFilterSet):
    """FilterSet for ProductType filtering."""

    filter_model: ClassVar[type[ProductType]] = ProductType
    sortable_fields: ClassVar[tuple[str, ...]] = ("name",)

    name: FilterField[str] = FilterField(operators=_TEXT_IN_OPERATORS)
    description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)

    @classmethod
    def search_vector_column(cls) -> ColumnElement[Any]:
        """Return the product-type search-vector column."""
        return column_expr(ProductType.search_vector)

    @classmethod
    def trigram_columns(cls) -> list[Any]:
        """Return product-type text columns used for trigram fallback."""
        return [ProductType.name]


class ProductTypeFilterWithRelationships(ProductTypeFilter):
    """ProductType filters with explicit relationship-backed fields."""

    sortable_fields: ClassVar[tuple[str, ...]] = (*ProductTypeFilter.sortable_fields, "category_name")
    relationship_joins: ClassVar[tuple[RelationshipFilterJoin, ...]] = (
        RelationshipFilterJoin("category_name", (ProductType.categories,), Category.name),
        RelationshipFilterJoin("category_description", (ProductType.categories,), Category.description),
        RelationshipFilterJoin("category_external_id", (ProductType.categories,), Category.external_id),
    )

    category_name: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    category_description: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
    category_external_id: FilterField[str] = FilterField(operators=_TEXT_OPERATORS)
