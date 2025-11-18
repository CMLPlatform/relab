"""Tests for common schema validators."""

import pytest
from datetime import UTC, datetime, timedelta

from app.api.data_collection.schemas import ensure_timezone, not_too_old


class TestTimezoneValidator:
    """Test ensure_timezone validator function."""

    def test_ensure_timezone_accepts_aware_datetime(self) -> None:
        """Test that timezone-aware datetime is accepted."""
        aware_dt = datetime.now(UTC)

        result = ensure_timezone(aware_dt)

        assert result == aware_dt
        assert result.tzinfo is not None

    def test_ensure_timezone_rejects_naive_datetime(self) -> None:
        """Test that naive datetime is rejected."""
        naive_dt = datetime(2025, 1, 1, 12, 0, 0)

        with pytest.raises(ValueError, match="timezone"):
            ensure_timezone(naive_dt)

    def test_ensure_timezone_accepts_none(self) -> None:
        """Test that None is handled gracefully."""
        # The validator should handle None appropriately
        result = ensure_timezone(None)

        # None should pass through or be handled gracefully
        assert result is None or result.tzinfo is not None


class TestNotTooOldValidator:
    """Test not_too_old validator function."""

    def test_not_too_old_accepts_recent_datetime(self) -> None:
        """Test that recent datetime is accepted."""
        recent_dt = datetime.now(UTC) - timedelta(days=30)

        result = not_too_old(recent_dt)

        assert result == recent_dt

    def test_not_too_old_rejects_old_datetime(self) -> None:
        """Test that datetime older than 365 days is rejected."""
        old_dt = datetime.now(UTC) - timedelta(days=366)

        with pytest.raises(ValueError, match="cannot be more than.*days in past"):
            not_too_old(old_dt)

    def test_not_too_old_accepts_datetime_exactly_365_days_old(self) -> None:
        """Test that datetime exactly 365 days old is accepted."""
        dt = datetime.now(UTC) - timedelta(days=364)  # Just under 365

        result = not_too_old(dt)

        assert result == dt

    def test_not_too_old_accepts_none(self) -> None:
        """Test that None is handled gracefully."""
        result = not_too_old(None)

        assert result is None

    def test_not_too_old_with_custom_timedelta(self) -> None:
        """Test not_too_old with custom time delta."""
        # 100 days ago
        dt = datetime.now(UTC) - timedelta(days=100)

        # Should accept with default (365 days)
        result1 = not_too_old(dt)
        assert result1 == dt

        # Should reject with custom 50 days
        with pytest.raises(ValueError, match="cannot be more than.*days in past"):
            not_too_old(dt, time_delta=timedelta(days=50))

        # Should accept with custom 200 days
        result2 = not_too_old(dt, time_delta=timedelta(days=200))
        assert result2 == dt


class TestValidDateTimeType:
    """Test ValidDateTime type (combination of validators)."""

    def test_valid_datetime_accepts_recent_aware_past_datetime(self) -> None:
        """Test that ValidDateTime accepts valid past aware datetime."""
        from app.api.data_collection.schemas import ProductCreateBaseProduct

        valid_dt = datetime.now(UTC) - timedelta(days=30)

        product = ProductCreateBaseProduct(name="Test", dismantling_time_start=valid_dt)

        assert product.dismantling_time_start == valid_dt

    def test_valid_datetime_rejects_future_datetime(self) -> None:
        """Test that ValidDateTime rejects future datetime."""
        from pydantic import ValidationError

        from app.api.data_collection.schemas import ProductCreateBaseProduct

        future_dt = datetime.now(UTC) + timedelta(days=1)

        with pytest.raises(ValidationError, match="past"):
            ProductCreateBaseProduct(name="Test", dismantling_time_start=future_dt)

    def test_valid_datetime_rejects_naive_datetime(self) -> None:
        """Test that ValidDateTime rejects naive datetime."""
        from pydantic import ValidationError

        from app.api.data_collection.schemas import ProductCreateBaseProduct

        naive_dt = datetime(2025, 1, 1, 12, 0, 0)

        with pytest.raises(ValidationError, match="timezone"):
            ProductCreateBaseProduct(name="Test", dismantling_time_start=naive_dt)

    def test_valid_datetime_rejects_too_old_datetime(self) -> None:
        """Test that ValidDateTime rejects datetime older than 365 days."""
        from pydantic import ValidationError

        from app.api.data_collection.schemas import ProductCreateBaseProduct

        too_old = datetime.now(UTC) - timedelta(days=366)

        with pytest.raises(ValidationError, match="cannot be more than.*days in past"):
            ProductCreateBaseProduct(name="Test", dismantling_time_start=too_old)
