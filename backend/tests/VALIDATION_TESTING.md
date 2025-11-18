# Validation Testing Guide

This document describes the comprehensive validation testing implemented for all layers of the ReLab backend.

## Overview

Validation tests ensure that data constraints, business rules, and input validation work correctly across all layers:

1. **Model Validation** - SQLModel/Pydantic field constraints and validators
2. **Schema Validation** - Pydantic input/output schema validation
3. **CRUD Validation** - Business logic and database constraints
4. **Router Validation** - API endpoint input validation
5. **Utils Validation** - Utility function validation (e.g., ownership checks)

## Test Organization

```
tests/
├── unit/
│   ├── models/
│   │   ├── test_product_validation.py      # Product model constraints
│   │   └── test_user_validation.py         # User/Organization constraints
│   ├── schemas/
│   │   ├── test_product_schemas.py         # Product schema validation
│   │   └── test_common_validators.py       # Common validator functions
│   ├── crud/
│   │   └── test_product_crud_validation.py # CRUD business logic
│   └── utils/
│       └── test_ownership_validation.py    # Ownership utility validation
└── integration/
    └── api/
        └── test_product_validation.py      # API endpoint validation
```

## Model Validation Tests

### Physical Properties (`test_product_validation.py`)

Tests field constraints for `PhysicalProperties`:

```python
# Weight must be positive (gt=0)
test_weight_must_be_positive()
test_height_must_be_positive()
test_width_must_be_positive()
test_depth_must_be_positive()

# Optional fields
test_all_dimensions_optional()

# Computed properties
test_volume_requires_all_dimensions()
```

**Validations Tested:**
- `weight_kg > 0`
- `height_cm > 0`
- `width_cm > 0`
- `depth_cm > 0`
- `volume_cm3` computation requires all dimensions

### Product Model (`test_product_validation.py`)

Tests field constraints and model validators:

```python
# String length constraints
test_name_length_validation()          # 2-100 chars
test_description_max_length()          # max 500 chars
test_brand_max_length()                # max 100 chars
test_model_max_length()                # max 100 chars
test_dismantling_notes_max_length()    # max 500 chars

# Datetime validation
test_dismantling_end_time_must_be_after_start_time()
test_dismantling_end_time_can_be_none()

# Computed fields
test_is_leaf_node_computed_field()
test_is_base_product_computed_field()
```

**Validations Tested:**
- `name`: 2-100 characters (required)
- `description`: max 500 characters (optional)
- `brand`: max 100 characters (optional)
- `model`: max 100 characters (optional)
- `dismantling_notes`: max 500 characters (optional)
- `dismantling_time_end` > `dismantling_time_start`
- Computed properties work correctly

### User Model (`test_user_validation.py`)

Tests user and organization constraints:

```python
# Username validation
test_username_pattern_validation()      # Only letters, numbers, underscores
test_username_whitespace_is_stripped()
test_username_is_optional()

# Organization validation
test_name_length_validation()           # 2-100 chars
test_name_must_be_unique()
test_location_max_length()              # max 100 chars
test_description_max_length()           # max 500 chars
```

**Validations Tested:**
- `username`: pattern `^[\w]+$` (letters, numbers, underscores only)
- `username`: whitespace stripped
- `organization.name`: 2-100 characters, unique
- `organization.location`: max 100 characters
- `organization.description`: max 500 characters

## Schema Validation Tests

### Product Schemas (`test_product_schemas.py`)

Tests Pydantic schema validation:

```python
# Physical properties schemas
test_create_schema_weight_must_be_positive()
test_update_schema_allows_partial_updates()

# Datetime validation
test_dismantling_time_must_have_timezone()
test_dismantling_time_must_be_in_past()
test_dismantling_time_not_too_old()          # Max 365 days

# Component validation
test_amount_in_parent_must_be_positive()
test_component_must_have_materials_or_subcomponents()
```

**Validations Tested:**
- All positive value constraints
- Timezone-aware datetime requirement
- Past datetime requirement (not future)
- Max age constraint (365 days)
- Component amount_in_parent > 0
- Components must have materials OR sub-components

### Common Validators (`test_common_validators.py`)

Tests shared validator functions:

```python
# Timezone validator
test_ensure_timezone_accepts_aware_datetime()
test_ensure_timezone_rejects_naive_datetime()

# Age validator
test_not_too_old_accepts_recent_datetime()
test_not_too_old_rejects_old_datetime()
test_not_too_old_with_custom_timedelta()

# Combined ValidDateTime type
test_valid_datetime_accepts_recent_aware_past_datetime()
test_valid_datetime_rejects_future_datetime()
test_valid_datetime_rejects_naive_datetime()
test_valid_datetime_rejects_too_old_datetime()
```

**Validators Tested:**
- `ensure_timezone()`: Requires timezone-aware datetime
- `not_too_old()`: Rejects datetime > 365 days old
- `ValidDateTime`: Combined validation (past + timezone + not too old)

## CRUD Validation Tests

### Physical Properties CRUD (`test_product_crud_validation.py`)

Tests business logic validation in CRUD operations:

```python
# Existence validation
test_create_physical_properties_for_nonexistent_product()
test_get_physical_properties_for_product_without_them()

# Duplicate prevention
test_create_physical_properties_for_product_that_already_has_them()

# Update validation
test_update_physical_properties_for_product_without_them()

# Delete validation
test_delete_physical_properties_for_product_without_them()
```

**Validations Tested:**
- Product must exist before creating properties
- Product cannot have duplicate physical properties
- Properties must exist before updating/deleting
- Appropriate error messages for all failures

### Product CRUD

Tests constraints at the CRUD layer:

```python
# Required fields
test_product_name_is_required()
test_product_owner_is_required_at_database_level()

# Existence checks
test_crud_validates_product_exists()
test_crud_validates_physical_properties_exist()
```

**Validations Tested:**
- Required fields enforced
- Database constraints enforced
- Existence checks before operations

## Router/API Validation Tests

### API Input Validation (`test_product_validation.py`)

Tests validation at the API/router level:

```python
# Input validation
test_create_product_with_invalid_name_length()
test_create_product_with_invalid_datetime()
test_create_product_with_missing_required_fields()
test_create_physical_properties_with_negative_values()

# HTTP status codes
test_validation_error_returns_422()
test_not_found_error_returns_404()
test_validation_error_includes_details()

# Query parameters
test_pagination_page_must_be_positive()
test_pagination_size_must_be_positive()
```

**Validations Tested:**
- Input validation returns 422 Unprocessable Entity
- Missing resources return 404 Not Found
- Validation errors include details
- Query parameters validated
- Proper error responses

## Utils Validation Tests

### Ownership Validation (`test_ownership_validation.py`)

Tests ownership utility functions:

```python
# Ownership checks
test_get_user_owned_object_with_correct_owner()
test_get_user_owned_object_with_wrong_owner()
test_get_user_owned_object_with_nonexistent_object()

# Error messages
test_ownership_error_includes_model_type()
test_ownership_error_includes_ids()
```

**Validations Tested:**
- Ownership correctly validated
- `UserOwnershipError` raised for wrong owner
- Error messages include useful information

## Running Validation Tests

### Run All Validation Tests

```bash
pytest tests/unit/models/test_product_validation.py
pytest tests/unit/models/test_user_validation.py
pytest tests/unit/schemas/
pytest tests/unit/crud/
pytest tests/unit/utils/
pytest tests/integration/api/test_product_validation.py
```

### Run by Layer

```bash
# Model validation only
pytest tests/unit/models/ -v

# Schema validation only
pytest tests/unit/schemas/ -v

# CRUD validation only
pytest tests/unit/crud/ -v

# API validation only
pytest tests/integration/api/test_product_validation.py -v

# Utils validation only
pytest tests/unit/utils/ -v
```

### Run Specific Validation Type

```bash
# All positive value validations
pytest -k "positive" -v

# All length validations
pytest -k "length" -v

# All datetime validations
pytest -k "datetime or time" -v

# All ownership validations
pytest -k "ownership" -v
```

## Key Validations Covered

### Field Constraints

✅ **Positive Values** (`gt=0`)
- weight_kg, height_cm, width_cm, depth_cm
- amount_in_parent
- product_type_id

✅ **String Lengths**
- Min length: name (2), organization name (2)
- Max length: name (100), description (500), brand (100), model (100)

✅ **Patterns**
- Username: `^[\w]+$` (alphanumeric + underscore only)

✅ **Uniqueness**
- Organization name must be unique

### Custom Validators

✅ **Datetime Validation**
- Must be timezone-aware
- Must be in the past
- Cannot be more than 365 days old
- End time must be after start time

✅ **Business Rules**
- Components must have materials OR sub-components
- Physical properties cannot be duplicated
- Ownership must be validated

### HTTP Status Codes

✅ **Validation Errors**: 422 Unprocessable Entity
✅ **Not Found**: 404 Not Found
✅ **Authorization**: 401/403 (auth layer)

## Best Practices

1. **Test Both Valid and Invalid** - Always test both passing and failing cases
2. **Test Edge Cases** - Boundary values (0, 1, max-1, max, max+1)
3. **Test Error Messages** - Verify errors include useful information
4. **Test All Layers** - Validation at model, schema, CRUD, and API levels
5. **Use Factories** - Leverage FactoryBoy for consistent test data
6. **Isolate Tests** - Each test should be independent

## Coverage

Validation tests cover:

- ✅ 20+ field constraint validations
- ✅ 10+ custom validator functions
- ✅ 5+ business rule validations
- ✅ Error message quality
- ✅ HTTP status codes
- ✅ Ownership and authorization
- ✅ Edge cases and boundaries

## Adding New Validation Tests

When adding new models or fields with validation:

1. **Model Tests** - Test field constraints in `tests/unit/models/`
2. **Schema Tests** - Test Pydantic validation in `tests/unit/schemas/`
3. **CRUD Tests** - Test business logic in `tests/unit/crud/`
4. **API Tests** - Test endpoint validation in `tests/integration/api/`
5. **Update Documentation** - Add to this file

## Example: Adding New Field Validation

```python
# 1. Add field to model
class Product(ProductBase, table=True):
    price: float = Field(gt=0, description="Product price")

# 2. Add model validation test
async def test_price_must_be_positive(self, db_session: AsyncSession) -> None:
    """Test that price must be greater than 0."""
    with pytest.raises(ValidationError, match="greater than 0"):
        ProductFactory.create(price=0)

# 3. Add schema validation test
def test_create_schema_price_validation(self) -> None:
    """Test price validation in create schema."""
    with pytest.raises(ValidationError, match="greater than 0"):
        ProductCreateBaseProduct(name="Test", price=-10.0)

# 4. Add API validation test
async def test_create_product_with_negative_price(
    self, async_client: AsyncClient
) -> None:
    """Test that API rejects negative prices."""
    response = await async_client.post(
        f"/users/{user.id}/products",
        json={"name": "Test", "price": -10.0}
    )
    assert response.status_code == 422
```

## Troubleshooting

### ValidationError not raised

- Check that you're testing the right layer (model vs schema)
- Verify field constraints are defined correctly
- Ensure factory is using the correct session

### Tests pass but validation doesn't work

- Check that validation is in the base model/schema
- Verify validators are registered correctly
- Test with actual API calls

### Error messages don't match

- Error messages may vary between Pydantic versions
- Use partial matching: `match="greater than"` not `match="greater than 0"`
- Check actual error message format first

## References

- [Pydantic Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [SQLModel Field Constraints](https://sqlmodel.tiangolo.com/tutorial/fields/)
- [FastAPI Validation](https://fastapi.tiangolo.com/tutorial/body-fields/)
