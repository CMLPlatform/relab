# Testing Guide

This document describes the testing setup and best practices for the ReLab backend.

## Overview

The test suite follows 2025 best practices for FastAPI + SQLModel + PostgreSQL applications:

- **pytest-asyncio** for async test support
- **httpx.AsyncClient** for async API testing (not TestClient)
- **FactoryBoy** for test data generation
- **Testcontainers** (optional) for real PostgreSQL instances
- **pytest-cov** for coverage reporting

## Test Structure

```
tests/
├── conftest.py              # Pytest configuration and fixtures
├── factories/               # FactoryBoy factories for models
│   ├── __init__.py
│   ├── background_data.py   # Taxonomy, Material, ProductType factories
│   ├── emails.py            # Email-related factories
│   ├── products.py          # Product and properties factories
│   └── users.py             # User and Organization factories
├── helpers/                 # Test utilities
│   ├── __init__.py
│   └── seed.py             # Database seeding utilities
├── integration/             # Integration tests (API endpoints)
│   └── api/
│       ├── test_products.py
│       └── test_units.py
├── unit/                    # Unit tests (models, services)
│   └── models/
│       ├── test_products.py
│       └── test_users.py
└── tests/                   # Legacy test location
    └── emails/
```

## Running Tests

### Basic Usage

Run all tests:
```bash
pytest
```

Run with coverage:
```bash
pytest --cov=app --cov-report=html
```

Run specific test file:
```bash
pytest tests/unit/models/test_products.py
```

Run specific test class or function:
```bash
pytest tests/unit/models/test_products.py::TestProduct::test_create_product
```

Run with verbose output:
```bash
pytest -v
```

Run only unit tests:
```bash
pytest tests/unit/
```

Run only integration tests:
```bash
pytest tests/integration/
```

### Using Testcontainers

By default, tests use the configured test database. To use Testcontainers (real PostgreSQL in Docker):

```bash
USE_TESTCONTAINERS=1 pytest
```

**Benefits:**
- Real PostgreSQL database (catches SQL compatibility issues)
- Isolated test environment
- Great for CI/CD pipelines

**Requirements:**
- Docker must be running
- Slower startup time (container initialization)

## Test Fixtures

### Database Fixtures

- `db_session`: Async database session with automatic rollback
- `async_engine`: Async SQLAlchemy engine
- `setup_test_database`: Session-scoped database setup with migrations

### HTTP Client Fixtures

- `async_client`: Async HTTP client for API testing (httpx.AsyncClient)

### Example Usage

```python
async def test_create_product(async_client: AsyncClient, db_session: AsyncSession) -> None:
    """Test creating a product via API."""
    # Setup test data using factories
    UserFactory._meta.sqlalchemy_session = db_session
    user = UserFactory.create()

    # Make API request
    response = await async_client.post(
        f"/users/{user.id}/products",
        json={"name": "Test Product"}
    )

    assert response.status_code == 201
```

## Factories

Factories use FactoryBoy to generate realistic test data.

### Available Factories

**Users:**
- `UserFactory` - Basic user
- `SuperuserFactory` - Superuser
- `OrganizationFactory` - Organization
- `OAuthAccountFactory` - OAuth account

**Products:**
- `ProductFactory` - Basic product
- `CompleteProductFactory` - Product with all properties
- `PhysicalPropertiesFactory` - Physical properties
- `CircularityPropertiesFactory` - Circularity properties

**Background Data:**
- `TaxonomyFactory` - Taxonomy
- `CategoryFactory` - Category
- `MaterialFactory` - Material
- `ProductTypeFactory` - Product type

### Factory Usage Examples

```python
# Create a user
user = UserFactory.create()

# Create a user with organization
user = UserFactory.create(with_organization=True)

# Create a product
product = ProductFactory.create(owner=user)

# Create a product with physical properties
product = ProductFactory.create(
    owner=user,
    with_physical_properties=True
)

# Create a complete product (all properties)
product = CompleteProductFactory.create(owner=user)

# Create with specific values
product = ProductFactory.create(
    owner=user,
    name="Specific Name",
    brand="Specific Brand"
)
```

## Database Seeding

Use helper functions to seed test databases:

```python
from tests.helpers.seed import seed_full_test_database, seed_products

async def test_with_seeded_data(db_session: AsyncSession) -> None:
    # Seed comprehensive test data
    data = await seed_full_test_database(db_session)

    # Access seeded data
    users = data["users"]
    products = data["products"]

    # Run your tests...
```

Available seeding functions:
- `seed_users(session, count=5)` - Create test users
- `seed_products(session, owner, count=10)` - Create test products
- `seed_complete_products(session, owner, count=5)` - Products with all properties
- `seed_all_background_data(session)` - Taxonomies, materials, product types
- `seed_full_test_database(session)` - Complete test dataset

## Writing Tests

### Unit Tests

Unit tests should test individual models, functions, or services in isolation.

```python
async def test_product_volume_calculation(db_session: AsyncSession) -> None:
    """Test that product volume is correctly calculated."""
    PhysicalPropertiesFactory._meta.sqlalchemy_session = db_session
    ProductFactory._meta.sqlalchemy_session = db_session
    UserFactory._meta.sqlalchemy_session = db_session

    product = ProductFactory.create()
    props = PhysicalPropertiesFactory.create(
        product=product,
        height_cm=10.0,
        width_cm=20.0,
        depth_cm=30.0
    )

    assert props.volume_cm3 == 6000.0
```

### Integration Tests

Integration tests should test API endpoints and full request/response cycles.

```python
async def test_get_user_products(async_client: AsyncClient, db_session: AsyncSession) -> None:
    """Test getting products for a user."""
    UserFactory._meta.sqlalchemy_session = db_session
    ProductFactory._meta.sqlalchemy_session = db_session

    user = UserFactory.create()
    product = ProductFactory.create(owner=user, name="Test Product")

    response = await async_client.get(f"/users/{user.id}/products")

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "Test Product"
```

## Best Practices

1. **Use factories** - Always use FactoryBoy factories instead of creating models manually
2. **Session rollback** - `db_session` fixture automatically rolls back after each test
3. **Async/await** - All test functions should be async
4. **Type hints** - Include type hints for better IDE support
5. **Descriptive names** - Test names should clearly describe what they test
6. **AAA pattern** - Arrange, Act, Assert
7. **One assertion concept** - Each test should test one concept
8. **Fast tests** - Keep unit tests fast (< 100ms)

## Continuous Integration

For CI/CD pipelines, use testcontainers for full database isolation:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    USE_TESTCONTAINERS=1 pytest --cov=app --cov-report=xml
  env:
    DOCKER_HOST: unix:///var/run/docker.sock
```

## Troubleshooting

### Tests hang or timeout

- Check that Docker is running (if using testcontainers)
- Ensure database migrations are up to date
- Check for deadlocks in transaction handling

### Import errors

- Ensure all `__init__.py` files are present
- Check that factories are properly registered in `tests/factories/__init__.py`

### Database connection errors

- Verify `.env` file has correct test database settings
- Check that PostgreSQL is running (if not using testcontainers)
- Ensure test database exists and is accessible

### Factory errors

- Always set `_meta.sqlalchemy_session` before creating factory instances
- Ensure parent objects exist before creating related objects

## Additional Resources

- [FastAPI Testing Documentation](https://fastapi.tiangolo.com/tutorial/testing/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [FactoryBoy Documentation](https://factoryboy.readthedocs.io/)
- [Testcontainers Python](https://testcontainers-python.readthedocs.io/)
