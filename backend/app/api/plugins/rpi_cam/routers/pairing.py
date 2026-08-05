"""Pairing endpoints for zero-config RPi camera registration.

Flow:
1. RPi generates a key pair and 6-char code, then POSTs code + public key to /register.
2. User enters the code in the Relab UI and POSTs to /claim.
3. Backend creates the camera and stores non-secret relay metadata in Redis.
4. RPi polls /poll until claimed, saves the camera id/backend URL, and starts the relay.
"""

import hmac
import logging

from fastapi import HTTPException, status
from relab_rpi_cam_models import (
    PairingClaimedRecord,
    PairingPendingRecord,
    PairingPollResponse,
    PairingRegisterRequest,
    PairingRegisterResponse,
)

from app.api.auth.dependencies import CurrentActiveUserDep
from app.api.auth.services.rate_limiter import limiter, rate_limit_bucket_key
from app.api.common.audiences import DeviceAPIRouter, PublicAPIRouter
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.plugins.rpi_cam import crud
from app.api.plugins.rpi_cam.exceptions import (
    PairingCodeAlreadyClaimedError,
    PairingCodeCollisionError,
    PairingCodeNotFoundError,
    PairingFingerprintMismatchError,
)
from app.api.plugins.rpi_cam.models import Camera
from app.api.plugins.rpi_cam.schemas import CameraCreate, CameraRead
from app.api.plugins.rpi_cam.schemas.pairing import FINGERPRINT_PATTERN, PairingClaimRequest, PairingPollRequest
from app.api.plugins.rpi_cam.utils.device_contracts import (
    build_claimed_bootstrap,
    build_claimed_record,
    build_waiting_record,
    dump_pairing_record,
    parse_pairing_record,
)
from app.core.config import settings as core_settings
from app.core.logging import sanitize_log_value
from app.core.redis import (
    RedisDep,
    delete_redis_key,
    get_redis_value,
    getdel_redis_value,
    set_redis_value,
    set_redis_value_nx,
)

logger = logging.getLogger(__name__)

router = PublicAPIRouter(prefix="/plugins/rpi-cam/pairing", tags=["RPi Camera Pairing"])
# register/poll are called by the Pi itself, never the app; keep them out of the
# app-facing public schema and tag them with the device audience explicitly instead
# of relying on the path-prefix fallback in common/routers/openapi.py.
device_router = DeviceAPIRouter(prefix="/plugins/rpi-cam/pairing", tags=["RPi Camera Pairing"])

PAIRING_KEY_PREFIX = "rpi_cam:pairing"
PAIRING_TTL_SECONDS = 10 * 60
PAIRING_CREDENTIAL_TTL_SECONDS = 300

REGISTER_RATE_LIMIT = "20/minute"
POLL_RATE_LIMIT = "60/minute"
CLAIM_RATE_LIMIT = "10/minute"
CLAIM_CODE_RATE_LIMIT = "5/minute"


def _pairing_key(code: str) -> str:
    return f"{PAIRING_KEY_PREFIX}:{code}"


def _pairing_log_id(code: str) -> str:
    """Return a non-reversible digest of a pairing code, safe to write to logs.

    The raw code is the claim credential for its TTL, so it must never appear in
    logs. Reuse the rate-limiter's keyed HMAC digest so the same code maps to a
    stable identifier across correlated log lines without exposing the secret.
    """
    return rate_limit_bucket_key("rpi-cam:pairing", code)


def _build_ws_url() -> str:
    """Derive the WebSocket relay URL from the backend's configured API URL."""
    base = str(core_settings.api_public_url).rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    return f"{ws_base}/v1/plugins/rpi-cam/ws/connect"


@device_router.post(
    "/register",
    response_model=PairingRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a pairing code (called by RPi)",
    dependencies=[limiter.dependency(REGISTER_RATE_LIMIT)],
)
async def register_pairing_code(
    body: PairingRegisterRequest,
    redis: RedisDep,
) -> PairingRegisterResponse:
    """Register a short-lived pairing code and the camera's public device key."""
    # PairingRegisterRequest is an external model (relab_rpi_cam_models); it doesn't
    # enforce the same charset as PairingPollRequest.fingerprint. Re-check here so a
    # fingerprint that would 422 on every subsequent poll is rejected up front instead.
    if not FINGERPRINT_PATTERN.fullmatch(body.rpi_fingerprint):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid fingerprint format.")

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

    logger.info("Pairing code %s registered.", _pairing_log_id(body.code))
    return PairingRegisterResponse(code=body.code, expires_in=PAIRING_TTL_SECONDS)


@router.post(
    "/claim",
    response_model=CameraRead,
    summary="Claim a pairing code and create a camera (called by user)",
    dependencies=[limiter.dependency(CLAIM_RATE_LIMIT)],
)
async def claim_pairing_code(
    body: PairingClaimRequest,
    session: AsyncSessionDep,
    current_user: CurrentActiveUserDep,
    redis: RedisDep,
) -> Camera:
    """Claim a pairing code and create a WebSocket-relayed camera.

    The pending record is consumed atomically (GETDEL) so two concurrent claims
    of the same code cannot both succeed: only the winner observes the pending
    record and goes on to create the camera. The loser sees a missing key and
    gets the same invalid-code error as an unknown code.
    """
    await limiter.ahit_key(CLAIM_CODE_RATE_LIMIT, rate_limit_bucket_key("rpi-cam:pairing:claim:code", body.code))
    key = _pairing_key(body.code)
    # Read the remaining pending-record TTL before GETDEL destroys it, so a failed
    # camera creation below can restore the record for its actual remaining window
    # instead of resetting the clock to a fresh, possibly-longer TTL.
    remaining_ttl = int(await redis.ttl(key))
    raw = await getdel_redis_value(redis, key)
    if raw is None:
        raise PairingCodeNotFoundError

    record = parse_pairing_record(raw)
    if not isinstance(record, PairingPendingRecord):
        # Not a pending code — most likely a re-claim attempt on a code this same
        # request already claimed. GETDEL above unconditionally removed it, so put
        # the still-valid claimed record back before reporting the conflict; the
        # Pi may not have polled it yet.
        await set_redis_value(redis, key, raw, ex=PAIRING_CREDENTIAL_TTL_SECONDS)
        raise PairingCodeAlreadyClaimedError

    try:
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
    except Exception:
        # Camera creation failed (DB down, conflict, etc.) after GETDEL already
        # consumed the pending record — restore it so the code isn't permanently
        # dead and the Pi's next poll doesn't 404 into a forced re-pair.
        restored = await set_redis_value(
            redis, key, raw, ex=remaining_ttl if remaining_ttl > 0 else PAIRING_TTL_SECONDS
        )
        if not restored:
            logger.warning(
                "Failed to restore pairing record %s after camera creation error; code is now dead.",
                _pairing_log_id(body.code),
            )
        raise
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
        _pairing_log_id(body.code),
        sanitize_log_value(current_user.id),
        sanitize_log_value(db_camera.id),
    )
    return db_camera


@device_router.post(
    "/poll",
    response_model=PairingPollResponse,
    summary="Poll pairing status (called by RPi)",
    dependencies=[limiter.dependency(POLL_RATE_LIMIT)],
)
async def poll_pairing_status(
    body: PairingPollRequest,
    redis: RedisDep,
) -> PairingPollResponse:
    """Poll for pairing completion. Returns non-secret relay metadata once claimed.

    Takes the code and fingerprint in a POST body (not query params) so the
    claim credential never reaches proxy/uvicorn access logs.
    """
    key = _pairing_key(body.code)
    raw = await get_redis_value(redis, key)
    if raw is None:
        raise PairingCodeNotFoundError

    record = parse_pairing_record(raw)

    if isinstance(record, PairingPendingRecord):
        if not hmac.compare_digest(record.rpi_fingerprint, body.fingerprint):
            raise PairingFingerprintMismatchError
        return PairingPollResponse.waiting()

    if isinstance(record, PairingClaimedRecord):
        if not hmac.compare_digest(record.rpi_fingerprint, body.fingerprint):
            raise PairingFingerprintMismatchError
        await delete_redis_key(redis, key)
        logger.info("Pairing credentials retrieved for code %s.", _pairing_log_id(body.code))
        return PairingPollResponse.from_claimed_bootstrap(
            build_claimed_bootstrap(
                camera_id=record.camera_id,
                ws_url=record.ws_url,
                key_id=record.key_id,
            )
        )

    raise PairingCodeNotFoundError
