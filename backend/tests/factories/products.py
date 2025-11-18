"""Factories for product-related models."""

from datetime import UTC, datetime
from typing import Any

from factory import Faker, LazyAttribute, SubFactory, post_generation
from factory.alchemy import SQLAlchemyModelFactory

from app.api.data_collection.models import CircularityProperties, PhysicalProperties, Product

from .users import UserFactory


class PhysicalPropertiesFactory(SQLAlchemyModelFactory):
    """Factory for creating PhysicalProperties instances."""

    class Meta:
        model = PhysicalProperties
        sqlalchemy_session_persistence = "commit"

    weight_g = Faker("pyfloat", left_digits=4, right_digits=2, positive=True, min_value=1, max_value=10000)
    height_cm = Faker("pyfloat", left_digits=2, right_digits=1, positive=True, min_value=1, max_value=200)
    width_cm = Faker("pyfloat", left_digits=2, right_digits=1, positive=True, min_value=1, max_value=200)
    depth_cm = Faker("pyfloat", left_digits=2, right_digits=1, positive=True, min_value=1, max_value=200)


class CircularityPropertiesFactory(SQLAlchemyModelFactory):
    """Factory for creating CircularityProperties instances."""

    class Meta:
        model = CircularityProperties
        sqlalchemy_session_persistence = "commit"

    # Recyclability
    recyclability_observation = Faker("sentence", nb_words=10)
    recyclability_comment = Faker("sentence", nb_words=5)
    recyclability_reference = Faker("url")

    # Repairability
    repairability_observation = Faker("sentence", nb_words=10)
    repairability_comment = Faker("sentence", nb_words=5)
    repairability_reference = Faker("url")

    # Remanufacturability
    remanufacturability_observation = Faker("sentence", nb_words=10)
    remanufacturability_comment = Faker("sentence", nb_words=5)
    remanufacturability_reference = Faker("url")


class ProductFactory(SQLAlchemyModelFactory):
    """Factory for creating Product instances."""

    class Meta:
        model = Product
        sqlalchemy_session_persistence = "commit"

    name = Faker("word")
    description = Faker("sentence", nb_words=15)
    brand = Faker("company")
    model = LazyAttribute(lambda obj: f"{Faker('word').generate()}-{Faker('random_int', min=100, max=999).generate()}")
    serial_number = Faker("ean13")
    purchase_date = Faker("date_time_this_year", before_now=True, after_now=False, tzinfo=UTC)
    purchase_price = Faker("pyfloat", left_digits=3, right_digits=2, positive=True, min_value=10, max_value=5000)
    purchase_currency = Faker("currency_code")

    owner = SubFactory(UserFactory)

    @post_generation
    def with_physical_properties(obj: Product, create: bool, extracted: Any, **kwargs: Any) -> None:
        """Optionally add physical properties to product.

        Usage:
            product = ProductFactory.create(with_physical_properties=True)
            product = ProductFactory.create(with_physical_properties=PhysicalPropertiesFactory())
        """
        if not create:
            return

        if extracted is True:
            # Create new physical properties
            obj.physical_properties = PhysicalPropertiesFactory(product=obj)
        elif isinstance(extracted, PhysicalProperties):
            # Use provided physical properties
            obj.physical_properties = extracted
            extracted.product = obj

    @post_generation
    def with_circularity_properties(obj: Product, create: bool, extracted: Any, **kwargs: Any) -> None:
        """Optionally add circularity properties to product.

        Usage:
            product = ProductFactory.create(with_circularity_properties=True)
            product = ProductFactory.create(with_circularity_properties=CircularityPropertiesFactory())
        """
        if not create:
            return

        if extracted is True:
            # Create new circularity properties
            obj.circularity_properties = CircularityPropertiesFactory(product=obj)
        elif isinstance(extracted, CircularityProperties):
            # Use provided circularity properties
            obj.circularity_properties = extracted
            extracted.product = obj


class CompleteProductFactory(ProductFactory):
    """Factory for creating Product with all related properties."""

    @post_generation
    def setup_complete(obj: Product, create: bool, extracted: Any, **kwargs: Any) -> None:
        """Add all properties to product."""
        if not create:
            return

        obj.physical_properties = PhysicalPropertiesFactory(product=obj)
        obj.circularity_properties = CircularityPropertiesFactory(product=obj)
