# Testing Setup - Quick Start

## Installation

The testing dependencies are automatically installed when you install the project with the `tests` dependency group:

```bash
uv sync
```

Or specifically install test dependencies:

```bash
uv sync --group tests
```

## Quick Start

### 1. Set up your environment

Ensure you have a `.env` file with test database configuration:

```bash
POSTGRES_TEST_DB=relab_test
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
```

### 2. Run tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app

# Run specific test file
pytest tests/unit/models/test_products.py

# Run only fast unit tests
pytest tests/unit/

# Run integration tests
pytest tests/integration/
```

## Using Testcontainers (Recommended for CI)

To use real PostgreSQL in Docker containers:

```bash
USE_TESTCONTAINERS=1 pytest
```

This ensures tests run against a real PostgreSQL instance, catching any SQL compatibility issues.

## What's Been Implemented

### ✅ 2025 Best Practices

- **pytest-asyncio**: Full async/await support
- **httpx.AsyncClient**: Modern async HTTP client (not TestClient)
- **FactoryBoy**: Realistic test data generation
- **Testcontainers**: Optional real PostgreSQL testing
- **Proper fixtures**: Session management with rollback
- **Type hints**: Full type safety in tests

### ✅ Test Coverage

**Unit Tests:**
- Product model validation
- Physical properties (weight in grams)
- Circularity properties (recyclability, repairability, remanufacturability)
- User and Organization models
- Computed properties (volume calculation)

**Integration Tests:**
- Product CRUD endpoints
- Pagination (recent feature)
- Filtering and sorting
- Units endpoint (g for grams)
- Error handling

**Factories:**
- Users (with/without organizations)
- Products (basic and complete)
- Physical/Circularity properties
- Background data (taxonomies, materials, product types)

**Helpers:**
- Database seeding utilities
- Test data generation

## Key Features Tested

Based on the 2025-10_working_branch features:

- ✅ Pagination for `users/me/products`
- ✅ Weight field in grams (changed from kg)
- ✅ Superuser product deletion
- ✅ Circularity properties model
- ✅ Product CRUD operations
- ✅ Sorting functionality

## Next Steps

1. **Run the tests** to ensure everything works
2. **Add authentication tests** for protected endpoints
3. **Expand integration tests** with real authentication
4. **Add performance tests** for pagination with large datasets
5. **Implement mutation testing** with pytest-mutpy

## Documentation

See [tests/TESTING.md](tests/TESTING.md) for comprehensive testing documentation.

## Common Commands

```bash
# Run all tests with coverage
pytest --cov=app --cov-report=html

# Run only unit tests
pytest tests/unit/ -v

# Run only integration tests
pytest tests/integration/ -v

# Run specific test
pytest tests/unit/models/test_products.py::TestProduct::test_create_product -v

# Run with testcontainers
USE_TESTCONTAINERS=1 pytest

# Generate HTML coverage report
pytest --cov=app --cov-report=html
open htmlcov/index.html  # View coverage report
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.13'

      - name: Install dependencies
        run: |
          pip install uv
          uv sync

      - name: Run tests with testcontainers
        run: |
          USE_TESTCONTAINERS=1 pytest --cov=app --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```
