# Validation Testing Guide

Comprehensive validation testing for all layers of the ReLab backend.

## Overview

This test suite validates data integrity, business rules, and input validation across:

1. **Model Validation** - SQLModel/Pydantic field constraints and validators
2. **Schema Validation** - Pydantic input schema validation
3. **CRUD Validation** - Business logic and database constraints
4. **Utils Validation** - Utility function validation (ownership, existence checks)

## Test Organization

```
tests/
├── unit/
│   ├── models/
│   │   ├── test_products.py                      # Product functionality
│   │   ├── test_product_validation.py            # Product constraints
│   │   ├── test_background_data_validation.py    # Background data constraints
│   │   ├── test_users.py                         # User functionality
│   │   └── test_user_validation.py               # User constraints
│   ├── schemas/
│   │   └── test_product_schemas.py               # Schema validation
│   ├── crud/
│   │   └── test_common_crud_utils.py             # Common CRUD utilities
│   └── utils/
│       └── test_ownership_validation.py          # Ownership checks
└── integration/
    └── api/
        ├── test_products.py                      # Product API
        └── test_units.py                         # Units API
```

## Test Coverage Summary

### Model Validation (60+ tests)

**Product Models:**
- PhysicalProperties: Positive values, volume calculation
- Product: String lengths, datetime validation, computed fields
- Circularity: All circularity aspects validation

**User Models:**
- Username pattern validation (alphanumeric + underscore)
- Organization name uniqueness and length
- Roles and relationships

**Background Data Models:**
- Taxonomy: Name, version, domains validation
- Category: Name length, taxonomy relationship
- Material: Name, density (> 0), CRM flag
- ProductType: Name length constraints

### Schema Validation (12 tests)

- PhysicalProperties positive values
- Datetime validation (timezone-aware, past, max 365 days)
- String length constraints
- Component validation (materials OR sub-components)
- ProductType ID validation

### CRUD Validation (10 tests)

- Model existence validation
- Linked items existence
- Duplicate prevention
- Proper error messages

### Utils Validation (6 tests)

- Ownership validation
- Error message quality

## Key Validations

### Field Constraints

✅ **Positive Values** (gt=0):
- weight_kg, height_cm, width_cm, depth_cm
- density_kg_m3
- amount_in_parent

✅ **String Lengths**:
- Min: name fields (2), version (1)
- Max: name (100-250), description (500), brand (100)

✅ **Patterns**:
- username: `^[\w]+$`

✅ **Uniqueness**:
- organization.name

### Custom Validators

✅ **Datetime Validation**:
- Timezone-aware requirement
- Past datetime requirement
- Max age (365 days)
- End time after start time

✅ **Business Rules**:
- Components need materials OR sub-components
- Physical properties unique per product
- Ownership validated

## Running Tests

### All Validation Tests

```bash
pytest tests/unit/models/ -v
pytest tests/unit/schemas/ -v
pytest tests/unit/crud/ -v
pytest tests/unit/utils/ -v
```

### By Module

```bash
# Product validation
pytest tests/unit/models/test_product_validation.py -v

# Background data validation
pytest tests/unit/models/test_background_data_validation.py -v

# User validation
pytest tests/unit/models/test_user_validation.py -v

# Schema validation
pytest tests/unit/schemas/test_product_schemas.py -v

# CRUD utilities
pytest tests/unit/crud/test_common_crud_utils.py -v
```

### By Validation Type

```bash
# Positive value validations
pytest -k "positive" -v

# Length validations
pytest -k "length" -v

# Datetime validations
pytest -k "datetime" -v

# Ownership validations
pytest -k "ownership" -v
```

## Best Practices

1. **Consolidate Similar Tests** - Test multiple similar constraints together
2. **Test Both Valid and Invalid** - Always test both passing and failing cases
3. **Test Edge Cases** - Boundary values (0, 1, max-1, max, max+1)
4. **Verify Error Messages** - Ensure errors include useful information
5. **Test All Layers** - Model, schema, CRUD, and API layers
6. **Use Factories** - Leverage FactoryBoy for consistent test data

## Adding New Validation Tests

When adding new models or fields with validation:

1. **Model Tests** - Test field constraints in `tests/unit/models/`
2. **Schema Tests** - Test Pydantic validation in `tests/unit/schemas/`
3. **CRUD Tests** - Test business logic in `tests/unit/crud/`
4. **Update Documentation** - Add to this file

### Example

```python
# 1. Add field to model
class Product(ProductBase, table=True):
    price: float = Field(gt=0, description="Product price")

# 2. Add model validation test
async def test_positive_value_constraints(self, db_session: AsyncSession) -> None:
    """Test that values must be positive."""
    with pytest.raises(ValidationError, match="greater than 0"):
        ProductFactory.create(price=0)
```

## References

- [Pydantic Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [SQLModel Field Constraints](https://sqlmodel.tiangolo.com/tutorial/fields/)
- [FastAPI Validation](https://fastapi.tiangolo.com/tutorial/body-fields/)
