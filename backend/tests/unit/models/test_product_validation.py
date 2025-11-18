"""Validation tests for Product and related models.

Focuses on field constraints and model validators.
"""

import pytest
from datetime import UTC, datetime, timedelta
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.data_collection.models import PhysicalProperties, Product
from tests.factories import PhysicalPropertiesFactory, ProductFactory, UserFactory


class TestPhysicalPropertiesValidation:
    """Test validation for PhysicalProperties model."""

    async def test_positive_value_constraints(self, db_session: AsyncSession) -> None:
        """Test that all physical property values must be positive (> 0)."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # Test zero/negative values are rejected
        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, weight_kg=0)

        with pytest.raises(ValidationError, match="greater than 0"):
            PhysicalPropertiesFactory.create(product=product, height_cm=-10.0)

        # Valid positive values should work
        props = PhysicalPropertiesFactory.create(product=ProductFactory.create(), weight_kg=5.0, height_cm=10.0)
        assert props.weight_kg == 5.0
        assert props.height_cm == 10.0

    async def test_volume_requires_all_dimensions(self, db_session: AsyncSession) -> None:
        """Test that volume_cm3 returns None if any dimension is missing."""
        PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        product = ProductFactory.create()

        # Missing depth - volume should be None
        props = PhysicalPropertiesFactory.create(product=product, height_cm=10.0, width_cm=20.0, depth_cm=None)
        assert props.volume_cm3 is None

        # All dimensions present - volume should be calculated
        props2 = PhysicalPropertiesFactory.create(
            product=ProductFactory.create(), height_cm=10.0, width_cm=20.0, depth_cm=30.0
        )
        assert props2.volume_cm3 == 6000.0


class TestProductValidation:
    """Test validation for Product model."""

    async def test_string_length_constraints(self, db_session: AsyncSession) -> None:
        """Test string field length validations."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        # Name: min 2, max 100
        with pytest.raises(ValidationError, match="at least 2 characters"):
            ProductFactory.create(name="A")

        with pytest.raises(ValidationError, match="at most 100 characters"):
            ProductFactory.create(name="A" * 101)

        # Description: max 500
        with pytest.raises(ValidationError, match="at most 500 characters"):
            ProductFactory.create(description="A" * 501)

        # Valid values
        product = ProductFactory.create(name="AB", description="A" * 500)
        assert product.name == "AB"
        assert len(product.description) == 500

    async def test_dismantling_time_validation(self, db_session: AsyncSession) -> None:
        """Test that dismantling_time_end must be after dismantling_time_start."""
        ProductFactory._meta.sqlalchemy_session = db_session
        UserFactory._meta.sqlalchemy_session = db_session

        start_time = datetime.now(UTC)
        end_time = start_time - timedelta(hours=1)  # End before start

        with pytest.raises(ValidationError, match="must be after start time"):
            ProductFactory.create(dismantling_time_start=start_time, dismantling_time_end=end_time)

        # Valid: end after start
        valid_end = start_time + timedelta(hours=2)
        product = ProductFactory.create(dismantling_time_start=start_time, dismantling_time_end=valid_end)
        assert product.dismantling_time_end > product.dismantling_time_start
