"""Pairing endpoints for zero-config RPi camera registration.

Flow:
1. RPi generates a key pair and 6-char code, then POSTs code + public key to /register.
2. User enters the code in the ReLab UI and POSTs to /claim.
3. Backend creates the camera and stores non-secret relay metadata in Redis.
4. RPi polls /poll until claimed, saves the camera id/backend URL, and starts the relay.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import Query, Request, status
from relab_rpi_cam_models import (
    PairingClaimedRecord,
    PairingPendingRecord,
    PairingPollResponse,
    PairingRegisterResponse,
)

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.services.rate_limiter import limiter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.common.routers.openapi import PublicAPIRouter
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.exceptions import (
    PairingCodeAlreadyClaimedError,
    PairingCodeCollisionError,
    PairingCodeNotFoundError,
    PairingFingerprintMismatchError,
)
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraRead
from app.api.plugins.rpi_cam.schemas.pairing import (
    PairingClaimRequest,
    PairingRegisterRequest,
)
from app.api.plugins.rpi_cam.utils.device_contracts import (
    build_claimed_bootstrap,
    build_claimed_record,
    build_waiting_record,
    dump_pairing_record,
    parse_pairing_record,
)
from app.core.config import settings as core_settings
from app.core.logging import sanitize_log_value
from app.core.redis import RedisDep, delete_redis_key, get_redis_value, set_redis_value, set_redis_value_nx

logger = logging.getLogger(__name__)

router = PublicAPIRouter(prefix="/plugins/rpi-cam/pairing", tags=["RPi Camera Pairing"])

PAIRING_KEY_PREFIX = "rpi_cam:pairing"
PAIRING_TTL_SECONDS = 10 * 60
PAIRING_CREDENTIAL_TTL_SECONDS = 300

REGISTER_RATE_LIMIT = "20/minute"
POLL_RATE_LIMIT = "60/minute"
CLAIM_RATE_LIMIT = "10/minute"

_STATUS_WAITING = "waiting"


def _pairing_key(code: str) -> str:
    return f"{PAIRING_KEY_PREFIX}:{code}"


def _build_ws_url() -> str:
    """Derive the WebSocket relay URL from the backend's configured API URL."""
    base = str(core_settings.backend_api_url).rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    return f"{ws_base}/plugins/rpi-cam/ws/connect"


@router.post(
    "/register",
    response_model=PairingRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a pairing code (called by RPi)",
)
@limiter.limit(REGISTER_RATE_LIMIT)
async def register_pairing_code(
    request: Request,
    body: PairingRegisterRequest,
    redis: RedisDep,
) -> PairingRegisterResponse:
    """Register a short-lived pairing code and the camera's public device key."""
    del request
    key = _pairing_key(body.code)
    payload = dump_pairing_record(
        build_waiting_record(
            rpi_fingerprint=body.rpi_fingerprint,
            public_key_jwk=body.public_key_jwk,
            key_id=body.key_id,
        )
    )
    stored = await set_redis_value_nx(redis, key, payload, ex=PAIRING_TTL_SECONDS)
    if not stored:
        raise PairingCodeCollisionError

    logger.info("Pairing code %s registered.", sanitize_log_value(body.code))
    return PairingRegisterResponse(code=body.code, expires_in=PAIRING_TTL_SECONDS)


@router.post(
    "/claim",
    response_model=CameraRead,
    summary="Claim a pairing code and create a camera (called by user)",
)
@limiter.limit(CLAIM_RATE_LIMIT)
async def claim_pairing_code(
    request: Request,
    body: PairingClaimRequest,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
) -> Camera:
    """Claim a pairing code and create a WebSocket-relayed camera."""
    del request
    key = _pairing_key(body.code)
    raw = await get_redis_value(redis, key)
    if raw is None:
        raise PairingCodeNotFoundError

    record = parse_pairing_record(raw)
    if not isinstance(record, PairingPendingRecord):
        raise PairingCodeAlreadyClaimedError

    db_camera = await crud.create_camera(
        session,
        CameraCreate(
            name=body.camera_name,
            description=body.description,
            relay_public_key_jwk=record.public_key_jwk.model_dump(exclude_none=True),
            relay_key_id=record.key_id,
        ),
        current_user.id,
    )
    paired_payload = dump_pairing_record(
        build_claimed_record(
            build_claimed_bootstrap(
                camera_id=str(db_camera.id),
                ws_url=_build_ws_url(),
                key_id=db_camera.relay_key_id,
            ),
            rpi_fingerprint=record.rpi_fingerprint,
        )
    )
    await set_redis_value(redis, key, paired_payload, ex=PAIRING_CREDENTIAL_TTL_SECONDS)

    logger.info(
        "Pairing code %s claimed by user %s, camera %s.",
        sanitize_log_value(body.code),
        sanitize_log_value(current_user.id),
        sanitize_log_value(db_camera.id),
    )
    return db_camera


@router.get(
    "/poll",
    response_model=PairingPollResponse,
    summary="Poll pairing status (called by RPi)",
)
@limiter.limit(POLL_RATE_LIMIT)
async def poll_pairing_status(
    request: Request,
    redis: RedisDep,
    code: str = Query(min_length=6, max_length=6, pattern=r"^[A-Z0-9]{6}$"),
    fingerprint: str = Query(min_length=8, max_length=64),
) -> PairingPollResponse:
    """Poll for pairing completion. Returns non-secret relay metadata once claimed."""
    del request
    key = _pairing_key(code)
    raw = await get_redis_value(redis, key)
    if raw is None:
        raise PairingCodeNotFoundError

    record = parse_pairing_record(raw)

    if isinstance(record, PairingPendingRecord):
        if not hmac.compare_digest(record.rpi_fingerprint, fingerprint):
            raise PairingFingerprintMismatchError
        return PairingPollResponse.waiting()

    if isinstance(record, PairingClaimedRecord):
        if not hmac.compare_digest(record.rpi_fingerprint, fingerprint):
            raise PairingFingerprintMismatchError
        await delete_redis_key(redis, key)
        logger.info("Pairing credentials retrieved for code %s.", sanitize_log_value(code))
        return PairingPollResponse.from_claimed_bootstrap(
            build_claimed_bootstrap(
                camera_id=record.camera_id,
                ws_url=record.ws_url,
                key_id=record.key_id,
            )
        )

    raise PairingCodeNotFoundError
