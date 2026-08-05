"""Concurrency controls for CPU-bound image processing."""

from functools import lru_cache

import anyio

from app.core.config import settings


@lru_cache(maxsize=1)
def image_resize_limiter() -> anyio.CapacityLimiter:
    """Return the shared cap on concurrent image-resize thread-pool workers.

    NOTE: a lazily-built process-wide singleton, not the request-scoped
    ``AppServices.image_resize_limiter``. Reaching that field from here would mean
    threading a limiter through Request -> router -> handler -> service call chains
    across the data_collection/reference_data routers that call into this pipeline;
    that plumbing existed once and was deleted as unused flexibility (commit
    d76f4da2). Revisit only if a per-request override is actually needed.
    """
    return anyio.CapacityLimiter(settings.image_resize_workers)
