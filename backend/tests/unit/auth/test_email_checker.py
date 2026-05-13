"""Unit tests for disposable-email blocklist loading and Redis caching."""
# ruff: noqa: SLF001 # Private member behaviour is tested here to avoid background task timing.

from __future__ import annotations

from typing import TYPE_CHECKING, Self
from unittest.mock import AsyncMock

from app.api.auth.services.email_checker import (
    DISPOSABLE_DOMAINS_URL,
    REDIS_DISPOSABLE_DOMAINS_KEY,
    EmailChecker,
    load_local_disposable_domains,
)

if TYPE_CHECKING:
    from pathlib import Path

    import pytest
    from redis.asyncio import Redis


def test_load_local_disposable_domains_skips_provenance(tmp_path: Path) -> None:
    """The disposable-email fallback loader should ignore header comments."""
    path = tmp_path / "domains.txt"
    path.write_text("# source metadata\nTEMP-Mail.org\nmailinator.com\n", encoding="utf-8")

    assert load_local_disposable_domains(path) == {"temp-mail.org", "mailinator.com"}


async def test_email_checker_seeds_and_checks_redis(redis_client: Redis) -> None:
    """Redis should be seeded from the local fallback and checked with set membership."""
    checker = EmailChecker(redis_client)

    await checker._store_domains({"mailinator.com"})
    checker._initialized = True

    assert await redis_client.sismember(REDIS_DISPOSABLE_DOMAINS_KEY, "mailinator.com")
    assert await checker.is_disposable("user@mailinator.com")


async def test_email_checker_keeps_existing_redis_cache_on_seed(redis_client: Redis) -> None:
    """Disposable-email startup should not overwrite an existing periodically refreshed cache."""
    await redis_client.sadd(REDIS_DISPOSABLE_DOMAINS_KEY, "cached.example")
    checker = EmailChecker(redis_client)

    await checker._seed_domains()
    checker._initialized = True

    assert await checker.is_disposable("user@cached.example")
    assert await redis_client.scard(REDIS_DISPOSABLE_DOMAINS_KEY) == 1


async def test_email_checker_remote_refresh_replaces_redis_cache(redis_client: Redis) -> None:
    """A successful remote refresh should replace the cached disposable-domain set."""
    checker = EmailChecker(redis_client)
    await checker._store_domains({"old.example"})
    checker._fetch_remote_domains = AsyncMock(return_value={"new.example"})  # type: ignore[method-assign]

    await checker.run_once()
    checker._initialized = True

    assert not await checker.is_disposable("user@old.example")
    assert await checker.is_disposable("user@new.example")


async def test_email_checker_fails_open_when_redis_check_fails(redis_client: Redis) -> None:
    """Redis lookup failures should not block registration."""
    checker = EmailChecker(redis_client)
    checker._initialized = True
    redis_client.sismember = AsyncMock(side_effect=TimeoutError("redis unavailable"))  # type: ignore[method-assign]

    assert not await checker.is_disposable("user@mailinator.com")


async def test_email_checker_remote_refresh_uses_shared_http_client(monkeypatch: pytest.MonkeyPatch) -> None:
    """Remote blocklist refreshes should inherit the shared outbound HTTP policy."""

    class FakeResponse:
        text = "mailinator.com\n"

        def raise_for_status(self) -> None:
            return None

    class FakeHttpClient:
        def __init__(self) -> None:
            self.urls: list[str] = []
            self.timeouts: list[float] = []

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str, *, timeout: float) -> FakeResponse:  # noqa: ASYNC109 - mirrors httpx API
            self.urls.append(url)
            self.timeouts.append(timeout)
            return FakeResponse()

    fake_client = FakeHttpClient()
    monkeypatch.setattr("app.api.auth.services.email_checker.create_http_client", lambda: fake_client)
    checker = EmailChecker(redis_client=None)

    domains = await checker._fetch_remote_domains()

    assert domains == {"mailinator.com"}
    assert fake_client.urls == [DISPOSABLE_DOMAINS_URL]
    assert fake_client.timeouts == [10.0]
