"""Route contract tests for the pre-registration email validation endpoint."""

from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.api.auth.routers.email_validation import router


def _validate_email_route() -> APIRoute:
    return next(route for route in router.routes if isinstance(route, APIRoute) and route.path == "/validate-email")


def test_validate_email_route_is_rate_limited() -> None:
    """The pre-registration email check must carry the shared limiter dependency."""
    route = _validate_email_route()
    dependency_names = {
        getattr(dependency.dependency, "__name__", "")
        for dependency in route.dependencies
        if dependency.dependency is not None
    }
    assert "rate_limit" in dependency_names


def test_validate_email_route_is_post_only() -> None:
    """The route must not still expose GET now that the email travels in the body."""
    route = _validate_email_route()
    assert route.methods == {"POST"}


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/v1/auth")
    return TestClient(app)


def test_validate_email_rejects_get() -> None:
    """GET must 405 now that this is a POST-only, body-carrying endpoint."""
    response = _client().get("/v1/auth/validate-email")
    assert response.status_code == 405


def test_validate_email_rejects_invalid_body() -> None:
    """A non-email payload must 422, not reach the email checker."""
    response = _client().post("/v1/auth/validate-email", json={"email": "not-an-email"})
    assert response.status_code == 422


def test_validate_email_rejects_missing_body() -> None:
    """A missing body must 422 rather than 500."""
    response = _client().post("/v1/auth/validate-email")
    assert response.status_code == 422


def test_validate_email_accepts_valid_body() -> None:
    """A well-formed email passes validation (no disposable-email checker configured)."""
    response = _client().post("/v1/auth/validate-email", json={"email": "user@example.com"})
    assert response.status_code == 200
    assert response.json() == {"isValid": True, "reason": None}
