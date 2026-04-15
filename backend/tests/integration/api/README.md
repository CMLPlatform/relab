# API Integration Tests

Use this tier for request/response behavior against the ASGI app with real routing, dependency overrides, and database-backed state when needed.

- Preferred fixtures: `api_client`, `api_client_user`, `api_client_superuser`, `db_session`
- Keep each test focused on one endpoint behavior
- Avoid multi-step CRUD stories here; move those to `tests/integration/flows/`
- Move multi-step scenarios to `tests/integration/flows/`
