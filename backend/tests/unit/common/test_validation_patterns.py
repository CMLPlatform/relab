"""Unit tests for schema validation patterns across the application.

Tests comprehensive validation patterns for schemas using Pydantic.
Demonstrates how to test constraints, validators, and error cases.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import Enum, StrEnum

import pytest
from pydantic import BaseModel, EmailStr, Field, ValidationError, ValidationInfo, field_validator

# Constants for test values to avoid magic value warnings
EMAIL_VALID_U = "Test@Example.COM"
EMAIL_VALID_L = "test@example.com"
INVALID_EMAIL = "invalid"
START_DATE = date(2024, 1, 1)
END_DATE = date(2024, 12, 31)
CODE_ABC = "ABC"
CODE_RAW = "  abc  "
PERC_75_12 = 75.12
PERC_RAW = 75.123
PRICE_RAW = "19.99"
PRICE_STR = "19.99"
PRICE_INVALID = "19.999"
COUNTRY_US = "US"
CITY_BOSTON = "Boston"
STREET_123 = "123 Main St"
NAME_JOHN = "John"
ITEM_1 = "Item 1"
ERR_EMAIL = "email"
ERR_END_DATE = "end_date"
ERR_CITY = "city"
ERR_AGE = "age"
ERR_NAME = "name"
ERR_MIN_LEN_5 = "String should have at least 5 characters"
DISCOUNT_CODE_SAVE10 = "SAVE10"
CC_1234 = "1234"
AT_SIGN = "@"
PROVIDED = "provided"
ADDRESS_LOC = "address"

# Error messages assigned to variables
ERR_MSG_EMAIL = "Invalid email format"
ERR_MSG_DATE_RANGE = "end_date must be after start_date"
ERR_MSG_DISCOUNT = "discount_code required when has_discount is True"
ERR_MSG_MUTUAL = "Cannot specify both credit_card and bank_account"


class StatusEnum(StrEnum):
    """Enum for status."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


class LevelEnum(int, Enum):
    """Enum for level."""

    LOW = 1
    MEDIUM = 2
    HIGH = 3


@pytest.mark.unit
class TestFieldValidators:
    """Test various field validator patterns."""

    def test_custom_field_validator_email(self) -> None:
        """Test email validation."""

        class ContactSchema(BaseModel):
            email: str

            @field_validator("email")
            @classmethod
            def validate_email(cls, v: str) -> str:
                if AT_SIGN not in v:
                    raise ValueError(ERR_MSG_EMAIL)
                return v.lower()

        # Valid email
        schema = ContactSchema(email=EMAIL_VALID_U)
        assert schema.email == EMAIL_VALID_L

        # Invalid email
        with pytest.raises(ValidationError) as exc_info:
            ContactSchema(email=INVALID_EMAIL)
        errors = exc_info.value.errors()
        assert any(e["loc"][0] == ERR_EMAIL for e in errors)

    def test_field_validator_with_dependencies(self) -> None:
        """Test validator that depends on multiple fields."""

        class DateRangeSchema(BaseModel):
            start_date: date
            end_date: date

            @field_validator("end_date")
            @classmethod
            def validate_date_range(cls, v: date, info: ValidationInfo) -> date:
                start = info.data.get("start_date")
                if start and v < start:
                    raise ValueError(ERR_MSG_DATE_RANGE)
                return v

        # Valid range
        schema = DateRangeSchema(
            start_date=START_DATE,
            end_date=END_DATE,
        )
        assert schema.start_date < schema.end_date

        # Invalid range
        with pytest.raises(ValidationError) as exc_info:
            DateRangeSchema(
                start_date=END_DATE,
                end_date=START_DATE,
            )
        errors = exc_info.value.errors()
        assert any(e["loc"][0] == ERR_END_DATE for e in errors)

    def test_field_validator_uppercase_conversion(self) -> None:
        """Test validator that transforms data."""

        class CodeSchema(BaseModel):
            code: str = Field(min_length=3, max_length=10)

            @field_validator("code")
            @classmethod
            def normalize_code(cls, v: str) -> str:
                return v.upper().strip()

        schema = CodeSchema(code=CODE_RAW)
        assert schema.code == CODE_ABC
        assert len(schema.code) == 3

    def test_multiple_validators_on_field(self) -> None:
        """Test multiple validators on single field."""

        class PercentageSchema(BaseModel):
            percentage: float = Field(ge=0, le=100)

            @field_validator("percentage")
            @classmethod
            def round_percentage(cls, v: float) -> float:
                return round(v, 2)

        # Valid with rounding
        schema = PercentageSchema(percentage=PERC_RAW)
        assert schema.percentage == PERC_75_12

        # Out of range
        with pytest.raises(ValidationError):
            PercentageSchema(percentage=150)


@pytest.mark.unit
class TestComplexFieldTypes:
    """Test validation of complex field types."""

    def test_decimal_field_validation(self) -> None:
        """Test Decimal field validation."""

        class PriceSchema(BaseModel):
            price: Decimal = Field(decimal_places=2, max_digits=10)

        # Valid price
        schema = PriceSchema(price=PRICE_RAW)
        assert isinstance(schema.price, Decimal)
        assert schema.price == Decimal(PRICE_STR)

        # Too many decimal places
        with pytest.raises(ValidationError):
            PriceSchema(price=PRICE_INVALID)

    def test_list_field_validation(self) -> None:
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

    def test_optional_field_validation(self) -> None:
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
            optional_field=PROVIDED,
            optional_with_default=100,
        )
        assert schema2.optional_field == PROVIDED
        assert schema2.optional_with_default == 100

    def test_nested_model_validation(self) -> None:
        """Test validation of nested Pydantic models."""

        class AddressSchema(BaseModel):
            street: str
            city: str
            country: str = COUNTRY_US

        class PersonSchema(BaseModel):
            name: str
            address: AddressSchema

        # Valid nested
        schema = PersonSchema(
            name=NAME_JOHN,
            address={"street": STREET_123, "city": CITY_BOSTON},
        )
        assert schema.address.city == CITY_BOSTON
        assert schema.address.country == COUNTRY_US

        # Invalid nested
        with pytest.raises(ValidationError) as exc_info:
            PersonSchema(
                name=NAME_JOHN,
                address={"street": STREET_123},  # Missing city
            )
        errors = exc_info.value.errors()
        assert any(ADDRESS_LOC in str(e["loc"]) for e in errors)

    def test_list_of_nested_models(self) -> None:
        """Test validation of lists of nested models."""

        class ItemSchema(BaseModel):
            id: int
            name: str

        class OrderSchema(BaseModel):
            items: list[ItemSchema]

        # Valid list of nested models
        schema = OrderSchema(
            items=[
                {"id": 1, "name": ITEM_1},
                {"id": 2, "name": "Item 2"},
            ]
        )
        assert len(schema.items) == 2
        assert schema.items[0].name == ITEM_1

        # Invalid nested item
        with pytest.raises(ValidationError):
            OrderSchema(
                items=[
                    {"id": 1, "name": ITEM_1},
                    {"id": 2},  # Missing name
                ]
            )


@pytest.mark.unit
class TestErrorHandling:
    """Test error handling and validation error details."""

    def test_validation_error_contains_field_info(self) -> None:
        """Test that ValidationError contains field information."""

        class StrictSchema(BaseModel):
            email: EmailStr
            age: int = Field(ge=0, le=150)

        with pytest.raises(ValidationError) as exc_info:
            StrictSchema(email=INVALID_EMAIL, age=200)

        errors = exc_info.value.errors()
        assert len(errors) == 2

        # Check that field names are in errors
        error_fields = {e["loc"][0] for e in errors}
        assert ERR_EMAIL in error_fields
        assert ERR_AGE in error_fields

    def test_validation_error_messages(self) -> None:
        """Test that error messages are helpful."""

        class MessageSchema(BaseModel):
            text: str = Field(min_length=5, max_length=100)

        with pytest.raises(ValidationError) as exc_info:
            MessageSchema(text="hi")

        errors = exc_info.value.errors()
        error_messages = [e["msg"] for e in errors]
        # Should contain length constraint info
        assert any(ERR_MIN_LEN_5 in str(msg) for msg in error_messages)

    def test_multiple_validation_errors_collected(self) -> None:
        """Test that all validation errors are collected, not just first."""

        class MultiSchema(BaseModel):
            name: str = Field(min_length=1)
            age: int = Field(ge=0, le=150)
            email: EmailStr

        # Multiple errors should all be reported
        with pytest.raises(ValidationError) as exc_info:
            MultiSchema(name="", age=999, email=INVALID_EMAIL)

        errors = exc_info.value.errors()
        error_fields = {e["loc"][0] for e in errors}
        assert ERR_NAME in error_fields
        assert ERR_AGE in error_fields
        assert ERR_EMAIL in error_fields


@pytest.mark.unit
class TestEnumValidation:
    """Test validation of enum fields."""

    def test_enum_string_validation(self) -> None:
        """Test string enum validation."""

        class StatusSchema(BaseModel):
            status: StatusEnum

        # Valid enum value
        schema = StatusSchema(status="active")
        assert schema.status == StatusEnum.ACTIVE

        # Invalid enum value
        with pytest.raises(ValidationError):
            StatusSchema(status="invalid")

    def test_enum_int_validation(self) -> None:
        """Test integer enum validation."""

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

    def test_required_if_another_field_present(self) -> None:
        """Test field is required only if another field is present."""

        class ConditionalSchema(BaseModel):
            has_discount: bool = False
            discount_code: str | None = None

            @field_validator("discount_code")
            @classmethod
            def validate_discount_code(cls, v: str | None, info: ValidationInfo) -> str | None:
                has_discount = info.data.get("has_discount")
                if has_discount and not v:
                    raise ValueError(ERR_MSG_DISCOUNT)
                return v

        # Valid: no discount, no code needed
        schema = ConditionalSchema(has_discount=False)
        assert schema.discount_code is None

        # Valid: has discount with code
        schema2 = ConditionalSchema(has_discount=True, discount_code=DISCOUNT_CODE_SAVE10)
        assert schema2.discount_code == DISCOUNT_CODE_SAVE10

        # Invalid: has discount but no code
        with pytest.raises(ValidationError):
            ConditionalSchema(has_discount=True, discount_code=None)

    def test_mutually_exclusive_fields(self) -> None:
        """Test mutually exclusive fields validation."""

        class MutualSchema(BaseModel):
            payment_method: str
            credit_card: str | None = None
            bank_account: str | None = None

            @field_validator("bank_account")
            @classmethod
            def validate_mutually_exclusive(cls, v: str | None, info: ValidationInfo) -> str | None:
                credit_card = info.data.get("credit_card")
                if v and credit_card:
                    raise ValueError(ERR_MSG_MUTUAL)
                return v

        # Valid: only credit card
        schema = MutualSchema(
            payment_method="card",
            credit_card=CC_1234,
        )
        assert schema.credit_card == CC_1234

        # Invalid: both specified
        with pytest.raises(ValidationError):
            MutualSchema(
                payment_method="mixed",
                credit_card=CC_1234,
                bank_account="5678",
            )
