"""Async background task helpers: a periodic base class and detached one-shots."""

import asyncio
import contextlib
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Coroutine

logger = logging.getLogger(__name__)


class PeriodicBackgroundTask:
    """Base class for asyncio periodic background tasks.

    Subclasses must implement ``run_once``, which is called every
    ``interval_seconds``.  The first execution is delayed by one full interval
    so that application startup is never blocked by background work.

    Lifecycle::

        task = MyTask(interval_seconds=3600)
        await task.initialize()  # starts the background loop
        ...
        await task.close()  # cancels the loop and waits for it
    """

    def __init__(self, interval_seconds: int) -> None:
        self.interval_seconds = interval_seconds
        self._task: asyncio.Task[None] | None = None

    async def run_once(self) -> None:
        """Override with the work to perform each interval."""
        raise NotImplementedError

    async def initialize(self) -> None:
        """Start the periodic background loop."""
        self._task = asyncio.create_task(self._loop())

    async def _loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self.interval_seconds)
                try:
                    await self.run_once()
                except Exception:
                    logger.exception("Error in periodic task %s:", self.__class__.__name__)
        except asyncio.CancelledError:
            logger.info("Periodic task %s cancelled.", self.__class__.__name__)
            raise

    async def close(self) -> None:
        """Cancel the background loop and wait for it to finish."""
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None


# Strong references to in-flight detached tasks: asyncio only holds a weak one, so a
# task nobody awaits can be garbage-collected mid-run.
_detached_tasks: set[asyncio.Task[None]] = set()


def spawn_detached(coro: Coroutine[object, object, object], *, name: str, max_in_flight: int | None = None) -> bool:
    """Run a coroutine outside the caller's lifetime, logging anything it raises.

    For work whose result the caller does not need and whose failure must not fail
    the caller. Deliberately not awaited anywhere, including at shutdown: the only
    current user regenerates derivable files, so a task lost to a restart costs a
    re-run of the backfill script, not data.

    Returns whether the coroutine was scheduled. With *max_in_flight* set, a caller
    arriving while that many detached tasks are already running is declined rather
    than queued: nothing awaits this work, so an arrival rate above the rate it
    completes at would otherwise grow the set without bound. The ceiling counts every
    detached task, not per name: one caller's backlog is the whole process's backlog.
    """
    if max_in_flight is not None and len(_detached_tasks) >= max_in_flight:
        logger.warning("Detached task %s declined: %d already in flight", name, len(_detached_tasks))
        coro.close()
        return False

    async def _guarded() -> None:
        try:
            await coro
        except Exception:
            logger.exception("Detached task %s failed:", name)

    task = asyncio.create_task(_guarded(), name=name)
    _detached_tasks.add(task)
    task.add_done_callback(_detached_tasks.discard)
    return True


async def drain_detached() -> None:
    """Wait for every in-flight detached task to finish.

    For a process that ends deliberately rather than serving requests (the seeder,
    a test) where "spawned" and "done" have to be the same thing before it exits.
    Long-running servers do not call this: a request must never wait on work the
    previous one detached.
    """
    while _detached_tasks:
        await asyncio.gather(*tuple(_detached_tasks), return_exceptions=True)
