"""Tests for the detached-task primitive behind the deferred thumbnail pass.

`spawn_detached` is the only thing keeping the wide-thumbnail work off the upload
response path, and nothing else exercised it: the media tests call the coroutine it
schedules directly, which skips the scheduling, the strong reference that stops the
task being collected mid-run, and the guard that swallows its failures.
"""

import asyncio
import logging
from typing import TYPE_CHECKING

from app.core.background_tasks import _detached_tasks, drain_detached, spawn_detached

if TYPE_CHECKING:
    import pytest


async def test_spawn_detached_runs_the_coroutine_and_drain_waits_for_it() -> None:
    """`drain_detached` must not return before the work it is draining finished."""
    finished = False

    async def work() -> None:
        nonlocal finished
        await asyncio.sleep(0)
        finished = True

    spawn_detached(work(), name="test:runs")
    assert not finished, "the task should not have run inline"

    await drain_detached()

    assert finished


async def test_a_failing_detached_task_is_logged_and_does_not_propagate(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A raise inside detached work must not surface as an unhandled task error."""

    async def boom() -> None:
        msg = "thumbnail encode failed"
        raise ValueError(msg)

    with caplog.at_level(logging.ERROR):
        spawn_detached(boom(), name="test:fails")
        await drain_detached()

    assert "Detached task test:fails failed" in caplog.text


async def test_finished_tasks_are_discarded_from_the_registry() -> None:
    """The strong-reference set must not grow without bound across uploads."""

    async def work() -> None:
        await asyncio.sleep(0)

    before = len(_detached_tasks)
    for index in range(5):
        spawn_detached(work(), name=f"test:discard-{index}")
    await drain_detached()

    assert len(_detached_tasks) == before


async def test_deferred_work_is_declined_once_the_ceiling_is_reached() -> None:
    """Nothing awaits detached work, so its arrival rate must not grow the set forever."""
    release = asyncio.Event()
    declined_ran = False

    async def blocked() -> None:
        await release.wait()

    async def declined() -> None:  # pragma: no cover - must never run
        nonlocal declined_ran
        declined_ran = True

    before = len(_detached_tasks)
    assert spawn_detached(blocked(), name="test:accepted", max_in_flight=before + 1)
    assert not spawn_detached(declined(), name="test:declined", max_in_flight=before + 1)

    release.set()
    await drain_detached()

    # A declined coroutine is closed, not left un-awaited for the GC to complain about.
    assert not declined_ran
