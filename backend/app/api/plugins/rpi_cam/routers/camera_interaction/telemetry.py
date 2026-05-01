"""Camera telemetry forwarding with Redis caching.

The mosaic dashboard polls one camera's telemetry every ~5s; with the cache,
those polls cost a Redis GET and no relay round-trip. The first poll (cold
cache) forwards to the Pi's ``GET /system/telemetry`` endpoint, caches the snapshot
for 120s, and returns it. Subsequent polls within 120s hit the cache.

The backend telemetry contract lives in ``app.api.plugins.rpi_cam.telemetry``
and is kept byte-compatible with the shared ``relab_rpi_cam_models.telemetry``
module (shared package 0.3.0+). When 0.5.0 publishes to PyPI, swap the local
copy for a straight import and delete this note.
"""

from __future__ import annotations

import logging

from pydantic import UUID4, ValidationError
from relab_rpi_cam_models.telemetry import TelemetrySnapshot

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam.constants import HttpMethod
from app.api.plugins.rpi_cam.exceptions import InvalidCameraResponseError
from app.api.plugins.rpi_cam.routers.camera_interaction.utils import build_camera_request, get_user_owned_camera
from app.api.plugins.rpi_cam.runtime_status import get_cached_telemetry, store_telemetry
from app.core.redis import OptionalRedisDep

router = PublicAPIRouter()
logger = logging.getLogger(__name__)

_TELEMETRY_ENDPOINT = "/system/telemetry"


@router.get(
    "/{camera_id}/telemetry",
    summary="Get a camera's latest telemetry snapshot",
    description=(
        "Return the most recent telemetry snapshot for the camera. Backed by a Redis cache with a 120s "
        "TTL so mosaic polling does not fan out one relay round-trip per camera on every refresh. "
        "Pass ``force_refresh=true`` to bypass the cache and re-fetch from the Pi."
    ),
)
async def get_camera_telemetry(
    camera_id: UUID4,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    redis: OptionalRedisDep,
    *,
    force_refresh: bool = False,
) -> TelemetrySnapshot:
    """Return a camera's telemetry snapshot, hitting Redis when possible."""
    camera = await get_user_owned_camera(session, camera_id, current_user.id, redis)

    if not force_refresh:
        cached = await get_cached_telemetry(redis, camera_id)
        if cached is not None:
            return cached

    # Cache miss (or explicit refresh): resolve camera ownership + online status
    # and forward to the Pi. ``get_user_owned_camera`` raises 503 if the camera
    # is offline, which is the right behaviour — no point hitting a dead relay.
    camera_request = build_camera_request(camera, redis)
    response = await camera_request(
        endpoint=_TELEMETRY_ENDPOINT,
        method=HttpMethod.GET,
        error_msg="Failed to fetch camera telemetry",
    )
    try:
        snapshot = TelemetrySnapshot.model_validate(response.json())
    except ValidationError as exc:
        raise InvalidCameraResponseError(exc.json()) from exc

    # ``force_refresh=True`` bypasses the cache on both read AND write —
    # the caller explicitly doesn't trust the cache layer this time, so we
    # don't taint the next cached read with the forced result either.
    if redis is not None and not force_refresh:
        await store_telemetry(redis, camera_id, snapshot)
    return snapshot
