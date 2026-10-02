"""Unit tests for the per-account guess budget."""

from unittest.mock import patch
from uuid import uuid4

import anyio
import pytest

from app.api.auth.exceptions import MfaCodeInvalidError
from app.api.auth.services.rate_limiter import account_guess_budget
from app.api.common.rate_limiting import Limiter, RateLimitExceededError


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
            pass

    with patch("app.api.auth.services.rate_limiter.limiter", new=Limiter(storage_uri="memory://")):
        async with anyio.create_task_group() as tg:
            for n in range(10):
                tg.start_soon(guess, n)

    assert len(checked) == 3


async def test_every_attempt_is_charged() -> None:
    """A right credential spends the budget too, so the charge can happen before the check."""
    user_id = uuid4()

    with patch("app.api.auth.services.rate_limiter.limiter", new=Limiter(storage_uri="memory://")):
        for _ in range(3):
            async with account_guess_budget(user_id):
                pass
        with pytest.raises(RateLimitExceededError):
            async with account_guess_budget(user_id):
                pass
