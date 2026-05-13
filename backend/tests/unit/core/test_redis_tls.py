"""Tests for Redis transport configuration."""

from __future__ import annotations

import ssl
from typing import TYPE_CHECKING, ClassVar

from pydantic import SecretStr

from app.core import redis as redis_module
from app.core.config import CoreSettings, Environment

if TYPE_CHECKING:
    from pathlib import Path
    from typing import Any

    import pytest


class FakeRedis:
    """Capture Redis constructor kwargs without opening a socket."""

    instances: ClassVar[list[FakeRedis]] = []

    def __init__(self, **kwargs: Any) -> None:  # noqa: ANN401 - mirrors redis-py constructor surface
        self.kwargs = kwargs
        self.instances.append(self)

    async def ping(self) -> bool:
        """Pretend the Redis connection is healthy."""
        return True


async def test_init_redis_omits_tls_options_when_tls_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Plain Redis connections should not receive TLS-only constructor options."""
    FakeRedis.instances.clear()
    monkeypatch.setattr(redis_module, "Redis", FakeRedis)
    monkeypatch.setattr(
        redis_module,
        "settings",
        CoreSettings(environment=Environment.DEV, redis_tls=False),
    )

    await redis_module.init_redis()

    assert FakeRedis.instances[0].kwargs["ssl"] is False
    assert "ssl_cert_reqs" not in FakeRedis.instances[0].kwargs
    assert "ssl_ca_certs" not in FakeRedis.instances[0].kwargs
    assert "ssl_check_hostname" not in FakeRedis.instances[0].kwargs


async def test_init_redis_uses_certificate_required_tls_when_enabled(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Redis TLS should validate server certificates instead of only encrypting bytes."""
    ca_file = tmp_path / "redis-ca.pem"
    FakeRedis.instances.clear()
    monkeypatch.setattr(redis_module, "Redis", FakeRedis)
    monkeypatch.setattr(
        redis_module,
        "settings",
        CoreSettings(
            environment=Environment.DEV,
            redis_host="redis.internal",
            redis_password=SecretStr("redis-secret"),
            redis_tls=True,
            redis_tls_ca_file=ca_file,
        ),
    )

    await redis_module.init_redis()

    assert FakeRedis.instances[0].kwargs["ssl"] is True
    assert FakeRedis.instances[0].kwargs["ssl_cert_reqs"] == ssl.CERT_REQUIRED
    assert FakeRedis.instances[0].kwargs["ssl_ca_certs"] == str(ca_file)
    assert FakeRedis.instances[0].kwargs["ssl_check_hostname"] is True


async def test_init_blocking_redis_uses_same_tls_options(monkeypatch: pytest.MonkeyPatch) -> None:
    """The blocking Redis client should not drift from the normal client TLS policy."""
    FakeRedis.instances.clear()
    monkeypatch.setattr(redis_module, "Redis", FakeRedis)
    monkeypatch.setattr(
        redis_module,
        "settings",
        CoreSettings(
            environment=Environment.DEV,
            redis_host="redis.internal",
            redis_password=SecretStr("redis-secret"),
            redis_tls=True,
        ),
    )

    await redis_module.init_blocking_redis()

    assert FakeRedis.instances[0].kwargs["ssl"] is True
    assert FakeRedis.instances[0].kwargs["ssl_cert_reqs"] == ssl.CERT_REQUIRED
    assert FakeRedis.instances[0].kwargs["ssl_ca_certs"] is None
    assert FakeRedis.instances[0].kwargs["ssl_check_hostname"] is True
