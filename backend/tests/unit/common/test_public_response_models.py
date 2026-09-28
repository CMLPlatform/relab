"""Structural guard: public-audience routes must not serve account- or owner-private read models.

``PublicAPIRouter`` tags every app-facing route with the public audience, so the public
OpenAPI export covers anonymous catalog reads and signed-in self-service routes alike.
Private read models may only appear on the self-service and owner routes listed below,
which scope the response to the caller in their dependencies. A new route (or a nested
field on a public read model) that exposes one fails here until it is reviewed and listed.
"""

from typing import Any, get_args

from fastapi.routing import APIRoute, iter_route_contexts
from pydantic import BaseModel
from relab_rpi_cam_models import LocalAccessInfo

from app.api.auth.schemas import OAuthAccountRead, UserRead
from app.api.common.audiences import RouteAudience, route_audiences
from app.api.plugins.rpi_cam.schemas import CameraRead
from app.main import create_app

# Account-private: email, linked OAuth accounts, preferences, quotas, terms state.
# Owner-private: camera relay credentials and the device-local API key.
PRIVATE_READ_MODELS: tuple[type[BaseModel], ...] = (UserRead, OAuthAccountRead, CameraRead, LocalAccessInfo)

# Routes that answer only about the caller's own account or cameras.
PRIVATE_MODEL_ROUTES = {
    ("GET", "/v1/users/me"),
    ("PATCH", "/v1/users/me"),
    ("POST", "/v1/users/me/accept-terms"),
    ("POST", "/v1/auth/verify"),
    ("GET", "/v1/oauth/github/associate/callback"),
    ("GET", "/v1/oauth/google/associate/callback"),
    ("GET", "/v1/oauth/google-youtube/associate/callback"),
    ("GET", "/v1/plugins/rpi-cam/cameras"),
    ("POST", "/v1/plugins/rpi-cam/cameras"),
    ("GET", "/v1/plugins/rpi-cam/cameras/{camera_id}"),
    ("PATCH", "/v1/plugins/rpi-cam/cameras/{camera_id}"),
    ("GET", "/v1/plugins/rpi-cam/cameras/{camera_id}/local-access"),
    ("POST", "/v1/plugins/rpi-cam/pairing/claim"),
}


def _reachable_models(annotation: Any, seen: set[type[BaseModel]]) -> set[type[BaseModel]]:
    """Collect every pydantic model reachable from an annotation, including nested fields and generics."""
    if isinstance(annotation, type) and issubclass(annotation, BaseModel) and annotation not in seen:
        seen.add(annotation)
        for field in annotation.model_fields.values():
            _reachable_models(field.annotation, seen)
    for arg in get_args(annotation):
        _reachable_models(arg, seen)
    return seen


def _public_routes_serving_private_models() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for ctx in iter_route_contexts(create_app().routes):
        route = ctx.route
        if not isinstance(route, APIRoute) or RouteAudience.PUBLIC.value not in route_audiences(route):
            continue
        models = _reachable_models(route.response_model, set())
        if any(issubclass(model, PRIVATE_READ_MODELS) for model in models):
            found.update((method, ctx.path or route.path) for method in route.methods or ())
    return found


def test_private_read_models_only_on_reviewed_public_routes() -> None:
    """Every public route serving a private model is listed, and every listed route still serves one."""
    assert _public_routes_serving_private_models() == PRIVATE_MODEL_ROUTES
