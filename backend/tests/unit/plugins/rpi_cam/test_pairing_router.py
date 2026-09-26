"""Unit tests for the RPi camera pairing router."""

import json
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from relab_rpi_cam_models import PairingClaimedRecord, PairingRegisterRequest, RelayAuthScheme

from app.api.common.rate_limiting import rate_limit_bucket_key
from app.api.plugins.rpi_cam.exceptions import PairingCodeAlreadyClaimedError, PairingCodeNotFoundError
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.routers.pairing import (
    CLAIM_CODE_RATE_LIMIT,
    PAIRING_TTL_SECONDS,
    _build_ws_url,
    claim_pairing_code,
    poll_pairing_status,
    register_pairing_code,
)
from app.api.plugins.rpi_cam.schemas.pairing import PairingClaimRequest, PairingPollRequest
from scripts.seed.factories.models import UserFactory

if TYPE_CHECKING:
    from redis.asyncio import Redis

PUBLIC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "y": "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "kid": "key-12345",
}
KEY_ID = "key-12345"
PAIRING_CODE = "ABCD23"
PAIRING_LOG_ID = rate_limit_bucket_key("rpi-cam:pairing", PAIRING_CODE)


def test_build_ws_url_uses_canonical_v1_plugin_route() -> None:
    """Pairing bootstrap should send the Pi to the canonical versioned WebSocket route."""
    assert _build_ws_url().endswith("/v1/plugins/rpi-cam/ws/connect")


def build_camera() -> Camera:
    """Build a camera database model stub."""
    return Camera(
        id=uuid4(),
        name="Test Camera",
        relay_public_key_jwk=PUBLIC_JWK,
        relay_key_id=KEY_ID,
        owner_id=uuid4(),
    )


async def test_register_pairing_code_logs_digest_not_raw_code(redis_client: Redis) -> None:
    """Register logging must record a non-reversible digest, never the raw claim code."""
    body = PairingRegisterRequest(
        code=PAIRING_CODE,
        rpi_fingerprint="fingerprint",
        public_key_jwk=PUBLIC_JWK,
        key_id=KEY_ID,
    )

    with patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger:
        response = await register_pairing_code(
            body=body,
            redis=redis_client,
        )

    assert response.code == body.code
    mock_logger.info.assert_called_once_with("Pairing code %s registered.", PAIRING_LOG_ID)
    assert PAIRING_CODE not in mock_logger.info.call_args.args[1]
    stored = await redis_client.get(f"rpi_cam:pairing:{PAIRING_CODE}")
    assert stored is not None
    payload = json.loads(stored)
    assert payload["public_key_jwk"] == PUBLIC_JWK
    assert payload["key_id"] == KEY_ID


async def test_register_pairing_code_rejects_fingerprint_outside_charset(redis_client: Redis) -> None:
    """A register-time fingerprint outside the poll-side charset must 422 up front.

    PairingRegisterRequest is an external model that only enforces length, so a
    fingerprint like this would otherwise be stored, then fail every subsequent
    poll (PairingPollRequest.fingerprint pattern), stranding the Pi.
    """
    body = PairingRegisterRequest(
        code=PAIRING_CODE,
        rpi_fingerprint="bad fingerprint!",
        public_key_jwk=PUBLIC_JWK,
        key_id=KEY_ID,
    )

    with pytest.raises(HTTPException) as exc_info:
        await register_pairing_code(body=body, redis=redis_client)

    assert exc_info.value.status_code == 422
    assert await redis_client.get(f"rpi_cam:pairing:{PAIRING_CODE}") is None


async def test_claim_pairing_code_logs_digest_not_raw_code(redis_client: Redis) -> None:
    """Claim logging must record a non-reversible digest, never the raw claim code."""
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    camera = build_camera()
    body = PairingClaimRequest(code=PAIRING_CODE, camera_name="Camera", description="Description")
    await redis_client.set(
        f"rpi_cam:pairing:{PAIRING_CODE}",
        json.dumps(
            {
                "status": "waiting",
                "rpi_fingerprint": "fingerprint",
                "public_key_jwk": PUBLIC_JWK,
                "key_id": KEY_ID,
            }
        ),
    )

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.crud.create_camera", new=AsyncMock(return_value=camera)),
        patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger,
        patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock),
    ):
        response = await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    assert response.id == camera.id
    assert mock_logger.info.call_args.args[1] == PAIRING_LOG_ID
    assert PAIRING_CODE not in mock_logger.info.call_args.args[1]
    stored = await redis_client.get(f"rpi_cam:pairing:{PAIRING_CODE}")
    assert stored is not None
    payload = json.loads(stored)
    assert payload["auth_scheme"] == "device_assertion"
    assert payload["key_id"] == KEY_ID
    assert "api_key" not in payload


async def test_claim_pairing_code_rate_limits_code_before_redis_lookup(redis_client: Redis) -> None:
    """Code-specific throttling should run before revealing whether a code exists."""
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    body = PairingClaimRequest(code=PAIRING_CODE, camera_name="Camera", description=None)

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock) as hit_key,
        pytest.raises(PairingCodeNotFoundError),
    ):
        await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    hit_key.assert_awaited_once_with(
        CLAIM_CODE_RATE_LIMIT,
        rate_limit_bucket_key("rpi-cam:pairing:claim:code", PAIRING_CODE),
    )


async def test_claim_pairing_code_concurrent_race_creates_exactly_one_camera(redis_client: Redis) -> None:
    """Two concurrent claims of the same code must not both succeed (GETDEL race).

    Simulates the interleaving deterministically: the second claim attempt runs
    from inside the first attempt's ``create_camera`` call, i.e. exactly between
    the winner's GETDEL and its claimed-record write-back. That second attempt
    must observe the key as already consumed.
    """
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    body = PairingClaimRequest(code=PAIRING_CODE, camera_name="Camera", description=None)
    await redis_client.set(
        f"rpi_cam:pairing:{PAIRING_CODE}",
        json.dumps(
            {
                "status": "waiting",
                "rpi_fingerprint": "fingerprint",
                "public_key_jwk": PUBLIC_JWK,
                "key_id": KEY_ID,
            }
        ),
    )

    loser_result: dict[str, BaseException] = {}

    async def racing_create_camera(*_args: object, **_kwargs: object) -> Camera:
        with patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock):
            try:
                await claim_pairing_code(
                    body=body,
                    session=session,
                    current_user=current_user,
                    redis=redis_client,
                )
            except (PairingCodeNotFoundError, PairingCodeAlreadyClaimedError) as exc:
                loser_result["error"] = exc
        return build_camera()

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.crud.create_camera", new=racing_create_camera),
        patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock),
    ):
        winner = await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    assert isinstance(winner, Camera)
    assert isinstance(loser_result.get("error"), PairingCodeNotFoundError)


async def test_claim_pairing_code_restores_pending_record_on_create_camera_failure(redis_client: Redis) -> None:
    """A DB failure after GETDEL must restore the pending record, not strand the code.

    Without the restore, GETDEL has already consumed the only copy of the pending
    record, so the code becomes permanently unclaimable and the Pi's next poll
    404s into a forced re-pair.
    """
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    body = PairingClaimRequest(code=PAIRING_CODE, camera_name="Camera", description=None)
    pending_payload = json.dumps(
        {
            "status": "waiting",
            "rpi_fingerprint": "fingerprint",
            "public_key_jwk": PUBLIC_JWK,
            "key_id": KEY_ID,
        }
    )
    await redis_client.set(f"rpi_cam:pairing:{PAIRING_CODE}", pending_payload, ex=PAIRING_TTL_SECONDS)

    with (
        patch(
            "app.api.plugins.rpi_cam.routers.pairing.crud.create_camera",
            new=AsyncMock(side_effect=RuntimeError("db down")),
        ),
        patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock),
        pytest.raises(RuntimeError, match="db down"),
    ):
        await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    restored = await redis_client.get(f"rpi_cam:pairing:{PAIRING_CODE}")
    assert restored == pending_payload
    ttl = await redis_client.ttl(f"rpi_cam:pairing:{PAIRING_CODE}")
    assert 0 < ttl <= PAIRING_TTL_SECONDS


async def test_claim_pairing_code_logs_warning_when_restore_itself_fails(redis_client: Redis) -> None:
    """If the compensating restore write also fails, that must be logged, not silent."""
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    body = PairingClaimRequest(code=PAIRING_CODE, camera_name="Camera", description=None)
    await redis_client.set(
        f"rpi_cam:pairing:{PAIRING_CODE}",
        json.dumps(
            {
                "status": "waiting",
                "rpi_fingerprint": "fingerprint",
                "public_key_jwk": PUBLIC_JWK,
                "key_id": KEY_ID,
            }
        ),
    )

    with (
        patch(
            "app.api.plugins.rpi_cam.routers.pairing.crud.create_camera",
            new=AsyncMock(side_effect=RuntimeError("db down")),
        ),
        patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock),
        patch("app.api.plugins.rpi_cam.routers.pairing.set_redis_value", new=AsyncMock(return_value=False)),
        patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger,
        pytest.raises(RuntimeError, match="db down"),
    ):
        await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    mock_logger.warning.assert_called_once()
    assert "restore" in mock_logger.warning.call_args.args[0].lower()


async def test_claim_pairing_code_restores_claimed_record_with_remaining_ttl(redis_client: Redis) -> None:
    """A re-claim attempt on an already-claimed code restores it with its actual remaining TTL.

    Regression: the restore used a fresh PAIRING_CREDENTIAL_TTL_SECONDS instead of the
    TTL read before GETDEL, resetting the clock to a possibly-longer window than the
    record actually had left, asymmetric with the create_camera-failure restore path.
    """
    session = AsyncMock()
    current_user = UserFactory.build(
        id=uuid4(),
        email="owner@example.com",
        hashed_password="hashed",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    body = PairingClaimRequest(code=PAIRING_CODE, camera_name="Camera", description=None)
    claimed_payload = PairingClaimedRecord(
        camera_id=str(uuid4()),
        ws_url="ws://testserver/v1/plugins/rpi-cam/ws/connect",
        key_id=KEY_ID,
        auth_scheme=RelayAuthScheme.DEVICE_ASSERTION,
        rpi_fingerprint="fingerprint",
    ).model_dump_json(exclude_none=True)
    short_ttl = 30
    await redis_client.set(f"rpi_cam:pairing:{PAIRING_CODE}", claimed_payload, ex=short_ttl)

    with (
        patch("app.api.plugins.rpi_cam.routers.pairing.limiter.ahit_key", new_callable=AsyncMock),
        pytest.raises(PairingCodeAlreadyClaimedError),
    ):
        await claim_pairing_code(
            body=body,
            session=session,
            current_user=current_user,
            redis=redis_client,
        )

    restored = await redis_client.get(f"rpi_cam:pairing:{PAIRING_CODE}")
    assert restored == claimed_payload
    ttl = await redis_client.ttl(f"rpi_cam:pairing:{PAIRING_CODE}")
    assert 0 < ttl <= short_ttl


def test_poll_request_rejects_non_ascii_fingerprint() -> None:
    """A non-ASCII fingerprint must be rejected by validation, not reach hmac.compare_digest."""
    with pytest.raises(ValidationError):
        PairingPollRequest(code=PAIRING_CODE, fingerprint="ünïcodeee")


async def test_poll_pairing_status_reads_body_and_logs_digest(redis_client: Redis) -> None:
    """Polling takes a POST body (not query params) and logs only a code digest."""
    await redis_client.set(
        f"rpi_cam:pairing:{PAIRING_CODE}",
        PairingClaimedRecord(
            camera_id=str(uuid4()),
            ws_url="ws://testserver/v1/plugins/rpi-cam/ws/connect",
            key_id=KEY_ID,
            auth_scheme=RelayAuthScheme.DEVICE_ASSERTION,
            rpi_fingerprint="fingerprint",
        ).model_dump_json(exclude_none=True),
    )

    with patch("app.api.plugins.rpi_cam.routers.pairing.logger") as mock_logger:
        response = await poll_pairing_status(
            body=PairingPollRequest(code=PAIRING_CODE, fingerprint="fingerprint"),
            redis=redis_client,
        )

    assert response.status == "paired"
    assert response.auth_scheme == "device_assertion"
    assert response.key_id == KEY_ID
    mock_logger.info.assert_called_once_with("Pairing credentials retrieved for code %s.", PAIRING_LOG_ID)
    assert PAIRING_CODE not in mock_logger.info.call_args.args[1]
    assert await redis_client.get(f"rpi_cam:pairing:{PAIRING_CODE}") is None
