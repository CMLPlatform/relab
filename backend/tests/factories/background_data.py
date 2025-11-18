"""Factories for background data models."""

from factory import Faker, LazyAttribute, SubFactory
from factory.alchemy import SQLAlchemyModelFactory

from app.api.background_data.models import Category, Material, ProductType, Taxonomy, TaxonomyDomain


class TaxonomyFactory(SQLAlchemyModelFactory):
    """Factory for creating Taxonomy instances."""

    class Meta:
        model = Taxonomy
        sqlalchemy_session_persistence = "commit"

    name = Faker("word")
    version = LazyAttribute(lambda obj: f"v{Faker('random_int', min=1, max=10).generate()}.0")
    description = Faker("sentence", nb_words=10)
    domains = LazyAttribute(lambda obj: {TaxonomyDomain.PRODUCTS})
    source = Faker("url")


class CategoryFactory(SQLAlchemyModelFactory):
    """Factory for creating Category instances."""

    class Meta:
        model = Category
        sqlalchemy_session_persistence = "commit"

    name = Faker("word")
    description = Faker("sentence", nb_words=10)
    external_id = Faker("uuid4")
    taxonomy = SubFactory(TaxonomyFactory)


class MaterialFactory(SQLAlchemyModelFactory):
    """Factory for creating Material instances."""

    class Meta:
        model = Material
        sqlalchemy_session_persistence = "commit"

    name = Faker("random_element", elements=["Plastic", "Metal", "Glass", "Wood", "Paper", "Composite"])
    description = Faker("sentence", nb_words=10)
    taxonomy = SubFactory(TaxonomyFactory)


class ProductTypeFactory(SQLAlchemyModelFactory):
    """Factory for creating ProductType instances."""

    class Meta:
        model = ProductType
        sqlalchemy_session_persistence = "commit"

    name = Faker("random_element", elements=["Electronics", "Furniture", "Clothing", "Appliance", "Tool"])
    description = Faker("sentence", nb_words=10)
    taxonomy = SubFactory(TaxonomyFactory)
