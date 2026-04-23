# Integration DB Tests

Use this tier for database-backed tests that exercise ORM models, CRUD, queries, and migrations without going through HTTP routing.

- Allowed fixtures: `db_session`, seed/data fixtures, factories
- Not required by default: `api_client`, app lifespan, routing stack
- Goal: verify persistence and query behavior with a real database
