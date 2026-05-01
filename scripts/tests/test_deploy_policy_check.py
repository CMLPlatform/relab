"""Tests for RELab deploy policy checks."""

from __future__ import annotations

import pytest

from scripts import deploy_policy_check


def service_with_image(image: str = "relab-api:prod-local") -> dict[str, object]:
    """Build a minimal service config for image policy tests."""
    return {"image": image}


def assert_image_policy_error(service_config: dict[str, object], message: str, service_name: str) -> None:
    """Assert that service image policy fails with the expected message."""
    with pytest.raises(AssertionError, match=message):
        deploy_policy_check.assert_deploy_service_image_policy(service_config, "prod", service_name)


def test_runtime_service_rejects_latest_tag_even_when_digest_pinned() -> None:
    """External images must not use the latest tag, even with a digest."""
    service_config = service_with_image(
        image="cloudflare/cloudflared:latest@sha256:6b599ca3e974349ead3286d178da61d291961182ec3fe9c505e1dd02c8ac31b0"
    )

    assert_image_policy_error(service_config, "prod: cloudflared must not use the latest image tag", "cloudflared")


def test_runtime_service_rejects_unpinned_external_image() -> None:
    """External images must include a sha256 digest."""
    service_config = service_with_image(image="cloudflare/cloudflared:2026.3.0")

    assert_image_policy_error(service_config, "prod: cloudflared external image must be digest-pinned", "cloudflared")


def test_runtime_service_accepts_local_and_digest_pinned_external_images() -> None:
    """Local RELab images and pinned external images pass image policy."""
    deploy_policy_check.assert_deploy_service_image_policy(service_with_image(), "prod", "api")
    deploy_policy_check.assert_deploy_service_image_policy(
        service_with_image(
            "cloudflare/cloudflared:2026.3.0@sha256:6b599ca3e974349ead3286d178da61d291961182ec3fe9c505e1dd02c8ac31b0"
        ),
        "prod",
        "cloudflared",
    )


def test_runtime_service_accepts_digest_only_external_image() -> None:
    """Digest-only external images are immutable and pass image policy."""
    deploy_policy_check.assert_deploy_service_image_policy(
        service_with_image("postgres@sha256:78481659c47e862334611ccdaf7c369c986b3046da9857112f3b309114a65fb4"),
        "prod",
        "postgres",
    )
