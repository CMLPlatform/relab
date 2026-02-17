"""Unit tests for schema validation patterns across the application.

Tests comprehensive validation patterns for schemas using Pydantic.
Demonstrates how to test constraints, validators, and error cases.
"""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import BaseModel, EmailStr, Field, ValidationError, field_validator


@pytest.mark.unit
class TestFieldValidators:
    """Test various field validator patterns."""

    def test_custom_field_validator_email(self):
        """Test email validation."""

        class ContactSchema(BaseModel):
            email: str

            @field_validator("email")
            @classmethod
            def validate_email(cls, v: str) -> str:
                if "@" not in v:
                    raise ValueError("Invalid email format")
                return v.lower()

        # Valid email
        schema = ContactSchema(email="Test@Example.COM")
        assert schema.email == "test@example.com"

        # Invalid email
        with pytest.raises(ValidationError) as exc_info:
            ContactSchema(email="invalid")
        errors = exc_info.value.errors()
        assert any(e["loc"][0] == "email" for e in errors)

    def test_field_validator_with_dependencies(self):
        """Test validator that depends on multiple fields."""

        class DateRangeSchema(BaseModel):
            start_date: date
            end_date: date

            @field_validator("end_date")
            @classmethod
            def validate_date_range(cls, v: date, info) -> date:
                start = info.data.get("start_date")
                if start and v < start:
                    raise ValueError("end_date must be after start_date")
                return v

        # Valid range
        schema = DateRangeSchema(
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
        )
        assert schema.start_date < schema.end_date

        # Invalid range
        with pytest.raises(ValidationError) as exc_info:
            DateRangeSchema(
                start_date=date(2024, 12, 31),
                end_date=date(2024, 1, 1),
            )
        errors = exc_info.value.errors()
        assert any(e["loc"][0] == "end_date" for e in errors)

    def test_field_validator_uppercase_conversion(self):
        """Test validator that transforms data."""

        class CodeSchema(BaseModel):
            code: str = Field(min_length=3, max_length=10)

            @field_validator("code")
            @classmethod
            def normalize_code(cls, v: str) -> str:
                return v.upper().strip()

        schema = CodeSchema(code="  abc  ")
        assert schema.code == "ABC"
        assert len(schema.code) == 3

    def test_multiple_validators_on_field(self):
        """Test multiple validators on single field."""

        class PercentageSchema(BaseModel):
            percentage: float = Field(ge=0, le=100)

            @field_validator("percentage")
            @classmethod
            def round_percentage(cls, v: float) -> float:
                return round(v, 2)

        # Valid with rounding
        schema = PercentageSchema(percentage=75.123)
        assert schema.percentage == 75.12

        # Out of range
        with pytest.raises(ValidationError):
            PercentageSchema(percentage=150)


@pytest.mark.unit
class TestComplexFieldTypes:
    """Test validation of complex field types."""

    def test_decimal_field_validation(self):
        """Test Decimal field validation."""

        class PriceSchema(BaseModel):
            price: Decimal = Field(decimal_places=2, max_digits=10)

        # Valid price
        schema = PriceSchema(price="19.99")
        assert isinstance(schema.price, Decimal)
        assert schema.price == Decimal("19.99")

        # Too many decimal places
        with pytest.raises(ValidationError):
            PriceSchema(price="19.999")

    def test_list_field_validation(self):
        """Test list field validation with constraints."""

        class TagsSchema(BaseModel):
            tags: list[str] = Field(min_length=1, max_length=5)

        # Valid list
        schema = TagsSchema(tags=["python", "testing"])
        assert len(schema.tags) == 2

        # Empty list
        with pytest.raises(ValidationError):
            TagsSchema(tags=[])

        # Too many items
        with pytest.raises(ValidationError):
            TagsSchema(tags=["a", "b", "c", "d", "e", "f"])

    def test_optional_field_validation(self):
        """Test optional fields with None validation."""

        class OptionalSchema(BaseModel):
            required_field: str
            optional_field: str | None = None
            optional_with_default: int | None = 42

        # With optional fields
        schema = OptionalSchema(required_field="test")
        assert schema.optional_field is None
        assert schema.optional_with_default == 42

        # With optional fields provided
        schema2 = OptionalSchema(
            required_field="test",
            optional_field="provided",
            optional_with_default=100,
        )
        assert schema2.optional_field == "provided"
        assert schema2.optional_with_default == 100

    def test_nested_model_validation(self):
        """Test validation of nested Pydantic models."""

        class AddressSchema(BaseModel):
            street: str
            city: str
            country: str = "US"

        class PersonSchema(BaseModel):
            name: str
            address: AddressSchema

        # Valid nested
        schema = PersonSchema(
            name="John",
            address={"street": "123 Main St", "city": "Boston"},
        )
        assert schema.address.city == "Boston"
        assert schema.address.country == "US"

        # Invalid nested
        with pytest.raises(ValidationError) as exc_info:
            PersonSchema(
                name="John",
                address={"street": "123 Main St"},  # Missing city
            )
        errors = exc_info.value.errors()
        assert any("address" in str(e["loc"]) for e in errors)

    def test_list_of_nested_models(self):
        """Test validation of lists of nested models."""

        class ItemSchema(BaseModel):
            id: int
            name: str

        class OrderSchema(BaseModel):
            items: list[ItemSchema]

        # Valid list of nested models
        schema = OrderSchema(
            items=[
                {"id": 1, "name": "Item 1"},
                {"id": 2, "name": "Item 2"},
            ]
        )
        assert len(schema.items) == 2
        assert schema.items[0].name == "Item 1"

        # Invalid nested item
        with pytest.raises(ValidationError):
            OrderSchema(
                items=[
                    {"id": 1, "name": "Item 1"},
                    {"id": 2},  # Missing name
                ]
            )


@pytest.mark.unit
class TestErrorHandling:
    """Test error handling and validation error details."""

    def test_validation_error_contains_field_info(self):
        """Test that ValidationError contains field information."""

        class StrictSchema(BaseModel):
            email: EmailStr
            age: int = Field(ge=0, le=150)

        with pytest.raises(ValidationError) as exc_info:
            StrictSchema(email="invalid", age=200)

        errors = exc_info.value.errors()
        assert len(errors) == 2

        # Check that field names are in errors
        error_fields = {e["loc"][0] for e in errors}
        assert "email" in error_fields
        assert "age" in error_fields

    def test_validation_error_messages(self):
        """Test that error messages are helpful."""

        class MessageSchema(BaseModel):
            text: str = Field(min_length=5, max_length=100)

        with pytest.raises(ValidationError) as exc_info:
            MessageSchema(text="hi")

        errors = exc_info.value.errors()
        error_messages = [e["msg"] for e in errors]
        # Should contain length constraint info
        assert any("String should have at least 5 characters" in str(msg) for msg in error_messages)

    def test_multiple_validation_errors_collected(self):
        """Test that all validation errors are collected, not just first."""

        class MultiSchema(BaseModel):
            name: str = Field(min_length=1)
            age: int = Field(ge=0, le=150)
            email: EmailStr

        # Multiple errors should all be reported
        with pytest.raises(ValidationError) as exc_info:
            MultiSchema(name="", age=999, email="invalid")

        errors = exc_info.value.errors()
        error_fields = {e["loc"][0] for e in errors}
        assert "name" in error_fields
        assert "age" in error_fields
        assert "email" in error_fields


@pytest.mark.unit
class TestEnumValidation:
    """Test validation of enum fields."""

    def test_enum_string_validation(self):
        """Test string enum validation."""
        from enum import Enum

        class StatusEnum(str, Enum):
            ACTIVE = "active"
            INACTIVE = "inactive"
            PENDING = "pending"

        class StatusSchema(BaseModel):
            status: StatusEnum

        # Valid enum value
        schema = StatusSchema(status="active")
        assert schema.status == StatusEnum.ACTIVE

        # Invalid enum value
        with pytest.raises(ValidationError):
            StatusSchema(status="invalid")

    def test_enum_int_validation(self):
        """Test integer enum validation."""
        from enum import Enum

        class LevelEnum(int, Enum):
            LOW = 1
            MEDIUM = 2
            HIGH = 3

        class LevelSchema(BaseModel):
            level: LevelEnum

        # Valid enum value
        schema = LevelSchema(level=2)
        assert schema.level == LevelEnum.MEDIUM

        # Invalid enum value
        with pytest.raises(ValidationError):
            LevelSchema(level=99)


@pytest.mark.unit
class TestConditionalValidation:
    """Test conditional validation logic."""

    def test_required_if_another_field_present(self):
        """Test field is required only if another field is present."""

        class ConditionalSchema(BaseModel):
            has_discount: bool = False
            discount_code: str | None = None

            @field_validator("discount_code")
            @classmethod
            def validate_discount_code(cls, v: str | None, info) -> str | None:
                has_discount = info.data.get("has_discount")
                if has_discount and not v:
                    raise ValueError("discount_code required when has_discount is True")
                return v

        # Valid: no discount, no code needed
        schema = ConditionalSchema(has_discount=False)
        assert schema.discount_code is None

        # Valid: has discount with code
        schema2 = ConditionalSchema(has_discount=True, discount_code="SAVE10")
        assert schema2.discount_code == "SAVE10"

        # Invalid: has discount but no code
        with pytest.raises(ValidationError):
            ConditionalSchema(has_discount=True, discount_code=None)

    def test_mutually_exclusive_fields(self):
        """Test mutually exclusive fields validation."""

        class MutualSchema(BaseModel):
            payment_method: str
            credit_card: str | None = None
            bank_account: str | None = None

            @field_validator("bank_account")
            @classmethod
            def validate_mutually_exclusive(cls, v: str | None, info) -> str | None:
                credit_card = info.data.get("credit_card")
                if v and credit_card:
                    raise ValueError("Cannot specify both credit_card and bank_account")
                return v

        # Valid: only credit card
        schema = MutualSchema(
            payment_method="card",
            credit_card="1234",
        )
        assert schema.credit_card == "1234"

        # Invalid: both specified
        with pytest.raises(ValidationError):
            MutualSchema(
                payment_method="mixed",
                credit_card="1234",
                bank_account="5678",
            )
