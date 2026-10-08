"""Unit tests for the per-account guess budget."""

from unittest.mock import patch
from uuid import uuid4

import anyio
import pytest

from app.api.auth.exceptions import MfaCodeInvalidError
from app.api.auth.services.rate_limiter import ACCOUNT_GUESS_DAILY_RATE_LIMIT, LOGIN_RATE_LIMIT, account_guess_budget
from app.api.common.rate_limiting import RateLimitExceededError

pytestmark = pytest.mark.usefixtures("fresh_guess_budget")


async def test_parallel_guesses_cannot_race_past_the_budget() -> None:
    """Concurrent wrong guesses get exactly the budget's worth of credential checks."""
    user_id = uuid4()
    checked: list[int] = []

    async def wrong_code(n: int) -> None:
        checked.append(n)
        await anyio.sleep(0.01)  # The credential check, slow enough to overlap.
        raise MfaCodeInvalidError

    async def guess(n: int) -> None:
        try:
            async with account_guess_budget(user_id):
                await wrong_code(n)
        except MfaCodeInvalidError, RateLimitExceededError:
            pass  # Both outcomes are expected; the test counts the checks that ran.

    async with anyio.create_task_group() as tg:
        for n in range(10):
            tg.start_soon(guess, n)

    assert len(checked) == 3


async def test_every_attempt_is_charged() -> None:
    """A right credential spends the budget too, so the charge can happen before the check."""
    user_id = uuid4()

    for _ in range(3):
        async with account_guess_budget(user_id):
            pass
    with pytest.raises(RateLimitExceededError):
        async with account_guess_budget(user_id):
            pass


async def test_account_guess_budget_has_daily_ceiling() -> None:
    """Guesses paced under the per-minute limit still stop at the daily ceiling."""
    user_id = uuid4()
    clock = [1_000_000.0]
    per_minute = int(LOGIN_RATE_LIMIT.split("/", 1)[0])
    per_day = int(ACCOUNT_GUESS_DAILY_RATE_LIMIT.split("/", 1)[0])

    with patch("limits.storage.memory.time.time", side_effect=lambda: clock[0]):
        for n in range(per_day):
            if n % per_minute == 0:
                clock[0] += 61  # A fresh minute window, the daily window keeps counting.
            async with account_guess_budget(user_id):
                pass
        clock[0] += 61
        with pytest.raises(RateLimitExceededError):
            async with account_guess_budget(user_id):
                pass
