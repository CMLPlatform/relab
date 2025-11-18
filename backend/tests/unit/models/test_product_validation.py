"""Validation tests for Product and related models."""

import pytest
from datetime import UTC, datetime, timedelta
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.models import PhysicalProperties, Product, ProductBase
from tests.factories import PhysicalPropertiesFactory, ProductFactory, UserFactory


class TestPhysicalPropertiesValidation:
    """Test validation for PhysicalProperties model."""

    async def test_weight_must_be_positive(self, db_session: AsyncSession) -> None:
        """Test that weight_kg must be greater than 0."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # Test zero weight
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, weight_kg=0)

        # Test negative weight
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, weight_kg=-5.0)

    async def test_height_must_be_positive(self, db_session: AsyncSession) -> None:
        """Test that height_cm must be greater than 0."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, height_cm=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, height_cm=-10.0)

    async def test_width_must_be_positive(self, db_session: AsyncSession) -> None:
        """Test that width_cm must be greater than 0."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, width_cm=0)

    async def test_depth_must_be_positive(self, db_session: AsyncSession) -> None:
        """Test that depth_cm must be greater than 0."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, depth_cm=0)

    async def test_all_dimensions_optional(self, db_session: AsyncSession) -> None:
        """Test that all dimension fields are optional."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # Should not raise - all fields are optional
        props = PhysicalPropertiesFactory.create(
            product=product, weight_kg=None, height_cm=None, width_cm=None, depth_cm=None
        )

        assert props.weight_kg is None
        assert props.height_cm is None
        assert props.width_cm is None
        assert props.depth_cm is None

    async def test_volume_requires_all_dimensions(self, db_session: AsyncSession) -> None:
        """Test that volume_cm3 returns None if any dimension is missing."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # Missing depth
        props = PhysicalPropertiesFactory.create(product=product, height_cm=10.0, width_cm=20.0, depth_cm=None)

        assert props.volume_cm3 is None

        # Missing height
        props2 = PhysicalPropertiesFactory.create(
            product=ProductFactory.create(), height_cm=None, width_cm=20.0, depth_cm=30.0
        )

        assert props2.volume_cm3 is None


class TestProductValidation:
    """Test validation for Product model."""

    async def test_name_length_validation(self, db_session: AsyncSession) -> None:
        """Test that product name must be between 2 and 100 characters."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        # Too short (less than 2 characters)
        with pytest.raises(ValidationError, match="at least 2 characters"):
            ProductFactory.create(name="A")

        # Too long (more than 100 characters)
        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductFactory.create(name="A" * 101)

        # Valid length
        product = ProductFactory.create(name="AB")
        assert product.name == "AB"

        product2 = ProductFactory.create(name="A" * 100)
        assert len(product2.name) == 100

    async def test_description_max_length(self, db_session: AsyncSession) -> None:
        """Test that description has max length of 500 characters."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        # Too long
        with pytest.raises(ValidationError, match="at most 500 characters"):
            ProductFactory.create(description="A" * 501)

        # Valid length
        product = ProductFactory.create(description="A" * 500)
        assert len(product.description) == 500

    async def test_brand_max_length(self, db_session: AsyncSession) -> None:
        """Test that brand has max length of 100 characters."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductFactory.create(brand="A" * 101)

        product = ProductFactory.create(brand="A" * 100)
        assert len(product.brand) == 100

    async def test_model_max_length(self, db_session: AsyncSession) -> None:
        """Test that model field has max length of 100 characters."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductFactory.create(model="A" * 101)

        product = ProductFactory.create(model="A" * 100)
        assert len(product.model) == 100

    async def test_dismantling_notes_max_length(self, db_session: AsyncSession) -> None:
        """Test that dismantling_notes has max length of 500 characters."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        with pytest.raises(ValidationError, match="at most 500 characters"):
            ProductFactory.create(dismantling_notes="A" * 501)

        product = ProductFactory.create(dismantling_notes="A" * 500)
        assert len(product.dismantling_notes) == 500

    async def test_dismantling_end_time_must_be_after_start_time(self, db_session: AsyncSession) -> None:
        """Test that dismantling_time_end must be after dismantling_time_start."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        start_time = datetime.now(UTC)
        end_time = start_time - timedelta(hours=1)  # End before start

        # Should raise validation error
        with pytest.raises(ValidationError, match="must be after start time"):
            ProductFactory.create(dismantling_time_start=start_time, dismantling_time_end=end_time)

    async def test_dismantling_end_time_can_be_after_start_time(self, db_session: AsyncSession) -> None:
        """Test that valid dismantling times are accepted."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        start_time = datetime.now(UTC)
        end_time = start_time + timedelta(hours=2)

        product = ProductFactory.create(dismantling_time_start=start_time, dismantling_time_end=end_time)

        assert product.dismantling_time_end > product.dismantling_time_start

    async def test_dismantling_end_time_can_be_none(self, db_session: AsyncSession) -> None:
        """Test that dismantling_time_end can be None (dismantling not completed)."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create(dismantling_time_end=None)

        assert product.dismantling_time_end is None

    async def test_amount_in_parent_is_optional(self, db_session: AsyncSession) -> None:
        """Test that amount_in_parent can be None for base products."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create(amount_in_parent=None)

        assert product.amount_in_parent is None

    async def test_is_leaf_node_computed_field(self, db_session: AsyncSession) -> None:
        """Test is_leaf_node computed field."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        # Product with no components is a leaf node
        product = ProductFactory.create()
        assert product.is_leaf_node is True

    async def test_is_base_product_computed_field(self, db_session: AsyncSession) -> None:
        """Test is_base_product computed field."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        # Product with no parent is a base product
        product = ProductFactory.create(parent=None)
        assert product.is_base_product is True


class TestProductBaseValidation:
    """Test validation in ProductBase (model validators)."""

    def test_validate_times_function_with_invalid_times(self) -> None:
        """Test that validate_times correctly rejects end time before start time."""
        from app.api.data_collection.models import validate_start_and_end_time

        start_time = datetime.now(UTC)
        end_time = start_time - timedelta(hours=1)

        with pytest.raises(ValueError, match="must be after start time"):
            validate_start_and_end_time(start_time, end_time)

    def test_validate_times_function_with_valid_times(self) -> None:
        """Test that validate_times accepts valid time range."""
        from app.api.data_collection.models import validate_start_and_end_time

        start_time = datetime.now(UTC)
        end_time = start_time + timedelta(hours=1)

        # Should not raise
        validate_start_and_end_time(start_time, end_time)

    def test_validate_times_function_with_none_end_time(self) -> None:
        """Test that validate_times allows None end time."""
        from app.api.data_collection.models import validate_start_and_end_time

        start_time = datetime.now(UTC)

        # Should not raise
        validate_start_and_end_time(start_time, None)
