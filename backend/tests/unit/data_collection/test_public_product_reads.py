"""Pins the assumption the edge's bot-fight-mode skip is built on.

`relab_public_reads_skip_bot_fight_mode` (infra/cloudflare-zone/locals.tf) skips Super Bot
Fight Mode for every GET under `/v1/products/`, on the strength of a comment saying every
one of them is an unauthenticated read. Nothing enforced that: adding an owner-scoped GET
under the same prefix would silently inherit the skip. This is that enforcement.

The authenticated per-user listing deliberately lives under `/users/{user_id}/products`,
outside the prefix the rule matches.
"""

from fastapi import APIRouter, Security
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute

from app.api.auth import dependencies as auth_dependencies
from app.api.data_collection.routers.product_read_routers import product_read_router

# Every `current_*` callable in the auth module gates a route on an authenticated user;
# `optional_current_active_user` is named apart because it only enriches an anonymous read.
# Deriving the set rather than listing it means a dependency added later is covered here
# the day it exists.
REQUIRED_AUTH_DEPENDENCIES = {
    value: name for name, value in vars(auth_dependencies).items() if name.startswith("current_") and callable(value)
}


def _auth_dependencies(dependant: Dependant) -> set[str]:
    """Names of the authenticating callables this route resolves, at any depth.

    Reads FastAPI's own resolved dependency tree rather than the endpoint signature:
    the tree already carries route-level and router-level ``dependencies=[Security(...)]``,
    which a signature never shows, and it reaches the nested deps that `current_lab_user`
    and `current_mfa_user` are built from.
    """
    found: set[str] = set()
    for sub in dependant.dependencies:
        if sub.call in REQUIRED_AUTH_DEPENDENCIES:
            found.add(REQUIRED_AUTH_DEPENDENCIES[sub.call])
        found |= _auth_dependencies(sub)
    return found


def test_the_guard_sees_a_router_level_security_dependency() -> None:
    """The guard is worthless if it only inspects endpoint parameters.

    A route can be gated by `dependencies=[Security(...)]` on the route or on its router,
    neither of which appears in `inspect.signature(endpoint)`.
    """
    router = APIRouter(dependencies=[Security(auth_dependencies.current_active_verified_user)])

    @router.get("/example")
    async def _example() -> None:
        pass

    route = next(r for r in router.routes if isinstance(r, APIRoute))
    assert _auth_dependencies(route.dependant) == {"current_active_verified_user"}


def test_no_route_under_the_products_prefix_requires_authentication() -> None:
    """Every GET under /v1/products/ must stay an unauthenticated read.

    If this fails, either move the route out of the prefix or narrow the Cloudflare rule
    before merging — otherwise the new route is served with bot protection disabled.
    """
    offenders = {
        route.path: names
        for route in product_read_router.routes
        if isinstance(route, APIRoute) and (names := _auth_dependencies(route.dependant))
    }
    assert not offenders, (
        f"authenticated routes under the /products prefix: {offenders}. "
        "The Cloudflare public-reads rule skips Super Bot Fight Mode for this whole prefix."
    )
