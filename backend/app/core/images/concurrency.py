"""Concurrency controls for CPU-bound image processing."""

from functools import lru_cache

import anyio

from app.core.config import settings


@lru_cache(maxsize=1)
def image_resize_limiter() -> anyio.CapacityLimiter:
    """Return the shared cap on concurrent image-resize thread-pool workers.

    NOTE: a lazily-built process-wide singleton, deliberately not request-scoped
    DI. A request-scoped limiter would mean threading it through Request -> router
    -> handler -> service call chains across the data_collection/reference_data
    routers that call into this pipeline; that plumbing existed once and was
    deleted as unused flexibility (commit d76f4da2). Revisit only if a per-request
    override is actually needed.
    """
    return anyio.CapacityLimiter(settings.image_resize_workers)


@lru_cache(maxsize=1)
def deferred_thumbnail_limiter() -> anyio.CapacityLimiter:
    """Return the cap on the off-request thumbnail workers.

    Separate from ``image_resize_limiter`` on purpose. anyio's limiter is FIFO, so a
    shared one makes an upload's inline resize queue behind every deferred job already
    waiting; the deferral would then add to the response time it exists to remove.

    Sized at half the request-path cap, and never below one: deferred work is by
    definition the work nothing is waiting for, so it yields thread-pool room to the
    uploads arriving alongside it.
    """
    return anyio.CapacityLimiter(max(1, settings.image_resize_workers // 2))
