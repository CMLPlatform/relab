"""Pins the assumption the edge's bot-fight-mode skip is built on.

`relab_public_reads_skip_bot_fight_mode` (infra/cloudflare-zone/locals.tf) skips Super Bot
Fight Mode for every GET under `/v1/products/`, on the strength of a comment saying every
one of them is an unauthenticated read. Nothing enforced that: adding an owner-scoped GET
under the same prefix would silently inherit the skip. This is that enforcement.

The authenticated per-user listing deliberately lives under `/users/{user_id}/products`,
outside the prefix the rule matches.
"""

import inspect
from typing import get_args, get_origin

from app.api.auth.dependencies import current_active_user
from app.api.data_collection.routers.product_read_routers import product_read_router


def _required_auth_dependencies(endpoint: object) -> list[str]:
    """Names of parameters on this endpoint that require an authenticated user."""
    return [
        name
        for name, parameter in inspect.signature(endpoint).parameters.items()
        if get_origin(parameter.annotation) is not None
        and any(getattr(meta, "dependency", None) is current_active_user for meta in get_args(parameter.annotation)[1:])
    ]


def test_no_route_under_the_products_prefix_requires_authentication() -> None:
    """Every GET under /v1/products/ must stay an unauthenticated read.

    If this fails, either move the route out of the prefix or narrow the Cloudflare rule
    before merging — otherwise the new route is served with bot protection disabled.
    """
    offenders = {
        route.path: names
        for route in product_read_router.routes
        if (names := _required_auth_dependencies(route.endpoint))
    }
    assert not offenders, (
        f"authenticated routes under the /products prefix: {offenders}. "
        "The Cloudflare public-reads rule skips Super Bot Fight Mode for this whole prefix."
    )
