"""Unit tests for common-password blocklist loading and Redis caching."""
# spell-checker: ignore passw

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from fastapi_users import InvalidPasswordException

from app.api.auth.services.common_password_checker import (
    COMMON_PASSWORDS_TARGET_COUNT,
    REDIS_COMMON_PASSWORDS_KEY,
    CommonPasswordChecker,
    load_local_common_passwords,
)
from app.api.auth.services.password_validator import validate_password

if TYPE_CHECKING:
    from pathlib import Path

    from redis.asyncio import Redis


def test_load_local_common_passwords_skips_provenance_and_has_asvs_sized_resource() -> None:
    """The bundled fallback must be a sourced ASVS-sized list, not an ad hoc tiny blocklist."""
    passwords = load_local_common_passwords()

    assert passwords.entry_count == COMMON_PASSWORDS_TARGET_COUNT
    assert passwords.matches("password12345")


def test_load_local_common_passwords_normalizes_and_compacts_entries(tmp_path: Path) -> None:
    """Header comments should be ignored and matching should support exact and compact forms."""
    path = tmp_path / "common_passwords.txt"
    path.write_text("# source metadata\nPass Word 12345\npass-word-12345\n", encoding="utf-8")

    passwords = load_local_common_passwords(path)

    assert passwords.entry_count == 2
    assert passwords.members == frozenset(
        {"exact:pass word 12345", "compact:password12345", "exact:pass-word-12345"}
    )


async def test_common_password_checker_seeds_and_checks_redis(redis_client: Redis) -> None:
    """Redis should be seeded from the deterministic local fallback and used for checks."""
    checker = CommonPasswordChecker(redis_client)

    await checker.initialize()

    assert await redis_client.scard(REDIS_COMMON_PASSWORDS_KEY) >= COMMON_PASSWORDS_TARGET_COUNT
    assert await checker.matches("PASSWORD12345")
    assert await checker.matches("pass-word-12345")


async def test_common_password_checker_falls_back_to_memory_when_redis_check_fails(redis_client: Redis) -> None:
    """Redis outages must not bypass the local common-password policy."""
    checker = CommonPasswordChecker(redis_client)
    await checker.initialize()
    redis_client.sismember = AsyncMock(side_effect=TimeoutError("redis unavailable"))  # type: ignore[method-assign]

    assert await checker.matches("password12345")


async def test_common_password_checker_uses_in_memory_store_without_redis() -> None:
    """The checker should remain useful in development and unit tests without Redis."""
    checker = CommonPasswordChecker(None)

    await checker.initialize()

    assert await checker.matches("password12345")
    assert not await checker.matches("correct-horse-battery-staple-v42")


async def test_common_password_checker_replaces_existing_redis_cache(redis_client: Redis) -> None:
    """Startup should replace Redis from the deterministic fallback to avoid stale auth policy."""
    await redis_client.sadd(REDIS_COMMON_PASSWORDS_KEY, "exact:already-seeded-password")
    checker = CommonPasswordChecker(redis_client)

    await checker.initialize()

    assert not await checker.matches("already-seeded-password")
    assert await checker.matches("password12345")


async def test_validate_password_uses_common_password_checker() -> None:
    """Password validation should delegate ASVS common-password checks to the checker when provided."""
    checker = AsyncMock()
    checker.matches.return_value = True

    with pytest.raises(InvalidPasswordException) as exc:
        await validate_password(
            "not-in-local-fixture-12345",
            email="a@b.c",
            common_password_checker=checker,
            skip_breach_check=True,
        )

    assert "too common" in exc.value.reason
    checker.matches.assert_awaited_once_with("not-in-local-fixture-12345")
