"""Base class for periodic async background tasks."""

import asyncio
import contextlib
import logging

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
