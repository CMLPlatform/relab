"""Unit tests for disposable-email blocklist loading and Redis caching."""

from typing import TYPE_CHECKING, Self
from unittest.mock import AsyncMock

from app.api.auth.services.email_checker import (
    DISPOSABLE_DOMAINS_URL,
    REDIS_DISPOSABLE_DOMAINS_KEY,
    EmailChecker,
    init_email_checker,
    load_local_disposable_domains,
)
from app.core.config import Environment, settings

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

    assert await checker.is_disposable("user@mailinator.com")


async def test_email_checker_keeps_existing_redis_cache_on_seed(redis_client: Redis) -> None:
    """Disposable-email startup should not overwrite an existing periodically refreshed cache."""
    checker = EmailChecker(redis_client)
    await checker._store_domains({"cached.example"})

    await checker._seed_domains()
    checker._initialized = True

    assert await checker.is_disposable("user@cached.example")
    assert not await checker.is_disposable("user@mailinator.com")


async def test_email_checker_remote_refresh_replaces_redis_cache(redis_client: Redis) -> None:
    """A successful remote refresh should replace the cached disposable-domain set."""
    checker = EmailChecker(redis_client)
    await checker._store_domains({"old.example"})
    checker._fetch_remote_domains = AsyncMock(return_value={"new.example"})  # type: ignore[method-assign]

    await checker.run_once()
    checker._initialized = True

    assert not await checker.is_disposable("user@old.example")
    assert await checker.is_disposable("user@new.example")


async def test_email_checker_uses_local_fallback_when_redis_check_fails(redis_client: Redis) -> None:
    """Redis lookup failures should fall back to the committed local policy."""
    checker = EmailChecker(redis_client)
    checker._initialized = True
    checker._domains = {"mailinator.com"}
    redis_client.sismember = AsyncMock(side_effect=TimeoutError("redis unavailable"))  # type: ignore[method-assign]

    assert await checker.is_disposable("user@mailinator.com")


async def test_email_checker_remote_refresh_uses_shared_http_client(
    monkeypatch: pytest.MonkeyPatch,
    redis_client: Redis,
) -> None:
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

        async def get(self, url: str, *, timeout: float) -> FakeResponse:
            self.urls.append(url)
            self.timeouts.append(timeout)
            return FakeResponse()

    fake_client = FakeHttpClient()
    monkeypatch.setattr("app.api.auth.services.email_checker.create_http_client", lambda: fake_client)
    checker = EmailChecker(redis_client)

    domains = await checker._fetch_remote_domains()

    assert domains == {"mailinator.com"}
    assert fake_client.urls == [DISPOSABLE_DOMAINS_URL]
    assert fake_client.timeouts == [10.0]


async def test_email_checker_allows_registration_before_it_is_initialized(redis_client: Redis) -> None:
    """The blocklist fails open: an unseeded checker must not block every registration."""
    checker = EmailChecker(redis_client)
    await checker._store_domains({"mailinator.com"})

    assert not await checker.is_disposable("user@mailinator.com")


async def test_email_checker_allows_an_address_it_cannot_parse(redis_client: Redis) -> None:
    """A domain that will not canonicalize is left to the registration validator, not blocked here."""
    checker = EmailChecker(redis_client)
    checker._initialized = True

    assert not await checker.is_disposable("not-an-email")


async def test_email_checker_stays_uninitialized_when_seeding_fails(redis_client: Redis) -> None:
    """A Redis outage at startup must degrade to allowing registrations, not crash the app."""
    checker = EmailChecker(redis_client)
    redis_client.exists = AsyncMock(side_effect=TimeoutError("redis unavailable"))  # type: ignore[method-assign]

    await checker.initialize()

    assert not checker._initialized
    assert not await checker.is_disposable("user@mailinator.com")
    await checker.close()


async def test_email_checker_keeps_the_cached_list_when_a_refresh_fails(redis_client: Redis) -> None:
    """A failed remote refresh must leave the previous blocklist in place, not empty it."""
    checker = EmailChecker(redis_client)
    await checker._store_domains({"mailinator.com"})
    checker._initialized = True
    checker._fetch_remote_domains = AsyncMock(side_effect=ConnectionError("upstream down"))  # type: ignore[method-assign]

    await checker.run_once()

    assert await checker.is_disposable("user@mailinator.com")


async def test_closing_the_email_checker_reverts_it_to_allowing_registrations(redis_client: Redis) -> None:
    """Shutdown must not leave a checker that reports on a blocklist it no longer refreshes."""
    checker = EmailChecker(redis_client)
    await checker.initialize()
    assert checker._initialized

    await checker.close()

    assert not checker._initialized
    assert not await checker.is_disposable("user@mailinator.com")


async def test_init_email_checker_is_skipped_outside_deployed_environments(redis_client: Redis) -> None:
    """Tests and local development never depend on the remote blocklist."""
    assert settings.environment is Environment.TESTING
    assert await init_email_checker(redis_client) is None


async def test_init_email_checker_seeds_a_deployed_environment(
    redis_client: Redis, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Deployed environments get a seeded, initialized checker."""
    monkeypatch.setattr(settings, "environment", Environment.PROD)

    checker = await init_email_checker(redis_client)

    assert checker is not None
    assert checker._initialized
    assert await redis_client.exists(REDIS_DISPOSABLE_DOMAINS_KEY)
    await checker.close()
