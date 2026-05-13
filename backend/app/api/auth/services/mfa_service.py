"""TOTP MFA helpers and short-lived MFA token storage."""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal
from uuid import UUID

import pyotp
from pydantic import UUID4

from app.api.auth.exceptions import MfaChallengeInvalidError
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT, limiter, rate_limit_bucket_key

if TYPE_CHECKING:
    from redis.asyncio import Redis

MFA_TOKEN_BYTES = 32
TOTP_SECRET_CHARS = 32
TOTP_DIGITS = 6
TOTP_PERIOD_SECONDS = 30
TOTP_VALID_WINDOW = 1
MFA_TOKEN_TTL_SECONDS = 10 * 60
MFA_ISSUER = "RELab"
MFA_TOKEN_ATTEMPT_RATE_LIMIT = LOGIN_RATE_LIMIT

MfaTransport = Literal["bearer", "session"]
_PendingTokenKind = Literal["login-challenge", "totp-setup", "oauth-handoff"]
SESSION_TRANSPORT: MfaTransport = "session"

_memory_pending_tokens: dict[str, tuple[float, str]] = {}
_memory_used_totp: dict[str, float] = {}


@dataclass(frozen=True, slots=True)
class MfaChallenge:
    """Decoded MFA login challenge metadata."""

    user_id: UUID
    transport: MfaTransport


@dataclass(frozen=True, slots=True)
class TotpSetup:
    """Decoded pending TOTP setup metadata."""

    user_id: UUID
    secret: str


def token_fingerprint(token: str) -> str:
    """Return a stable non-secret token fingerprint."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _pending_token_key(kind: _PendingTokenKind, token: str) -> str:
    return f"auth:mfa:{kind}:{token_fingerprint(token)}"


def _new_token() -> str:
    return secrets.token_urlsafe(MFA_TOKEN_BYTES)


def _encode_metadata(payload: dict[str, str]) -> str:
    return json.dumps(payload, separators=(",", ":"))


def _decode_metadata(raw_value: bytes | str | None) -> dict[str, str]:
    if raw_value is None:
        raise MfaChallengeInvalidError
    try:
        payload = json.loads(raw_value.decode("utf-8") if isinstance(raw_value, bytes) else raw_value)
    except (TypeError, json.JSONDecodeError) as err:
        raise MfaChallengeInvalidError from err
    if not isinstance(payload, dict) or not all(isinstance(key, str) for key in payload):
        raise MfaChallengeInvalidError
    return {key: str(value) for key, value in payload.items()}


async def _store_pending_token(
    redis: Redis | None,
    *,
    kind: _PendingTokenKind,
    payload: dict[str, str],
) -> str:
    token = _new_token()
    metadata = _encode_metadata(payload)
    key = _pending_token_key(kind, token)
    if redis is None:
        _memory_pending_tokens[key] = (time.monotonic() + MFA_TOKEN_TTL_SECONDS, metadata)
        return token
    await redis.setex(key, MFA_TOKEN_TTL_SECONDS, metadata)
    return token


async def _read_pending_token(
    redis: Redis | None,
    *,
    kind: _PendingTokenKind,
    token: str,
    consume: bool,
) -> dict[str, str]:
    key = _pending_token_key(kind, token)
    if redis is None:
        expires_at, raw_metadata = _memory_pending_tokens.get(key, (0.0, ""))
        if expires_at <= time.monotonic():
            _memory_pending_tokens.pop(key, None)
            raise MfaChallengeInvalidError
        if consume:
            _memory_pending_tokens.pop(key, None)
    else:
        raw_metadata = await redis.getdel(key) if consume else await redis.get(key)
        if raw_metadata is None:
            raise MfaChallengeInvalidError

    return _decode_metadata(raw_metadata)


def _parse_user_id(metadata: dict[str, str]) -> UUID:
    try:
        return UUID(metadata["user_id"])
    except (KeyError, ValueError) as err:
        raise MfaChallengeInvalidError from err


def _parse_transport(metadata: dict[str, str]) -> MfaTransport:
    transport = metadata.get("transport")
    if transport not in ("bearer", "session"):
        raise MfaChallengeInvalidError
    return transport


def enforce_mfa_token_rate_limit(token: str) -> None:
    """Apply the shared login-attempt limit to an MFA token fingerprint."""
    limiter.hit_key(MFA_TOKEN_ATTEMPT_RATE_LIMIT, rate_limit_bucket_key("auth:mfa:token", token_fingerprint(token)))


def generate_totp_secret() -> str:
    """Generate a new TOTP seed using CSPRNG bytes."""
    return pyotp.random_base32(length=TOTP_SECRET_CHARS)


def _totp(secret: str) -> pyotp.TOTP:
    return pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD_SECONDS)


def generate_totp_code(secret: str, *, for_time: int | None = None) -> str:
    """Generate a TOTP code for the given server-side time."""
    timestamp = int(time.time()) if for_time is None else int(for_time)
    return _totp(secret).at(timestamp)


def _matching_totp_counter(secret: str, code: str, *, for_time: int | None = None) -> int | None:
    if not code.isdecimal() or len(code) != TOTP_DIGITS:
        return None
    timestamp = int(time.time()) if for_time is None else int(for_time)
    current_counter = timestamp // TOTP_PERIOD_SECONDS
    totp = _totp(secret)
    for window_offset in range(-TOTP_VALID_WINDOW, TOTP_VALID_WINDOW + 1):
        counter = current_counter + window_offset
        if pyotp.utils.strings_equal(totp.at(counter * TOTP_PERIOD_SECONDS), code):
            return counter
    return None


async def verify_totp_code_once(
    redis: Redis | None,
    *,
    user_id: UUID4,
    secret: str,
    code: str,
    for_time: int | None = None,
) -> bool:
    """Verify and record a TOTP code so the same time-step cannot be reused."""
    counter = _matching_totp_counter(secret, code, for_time=for_time)
    if counter is None:
        return False

    key = f"auth:mfa:totp-used:{user_id}:{counter}"
    ttl = (TOTP_VALID_WINDOW + 2) * TOTP_PERIOD_SECONDS
    if redis is None:
        now = time.monotonic()
        expires_at = _memory_used_totp.get(key)
        if expires_at and expires_at > now:
            return False
        _memory_used_totp[key] = now + ttl
        return True

    return bool(await redis.set(key, "1", ex=ttl, nx=True))


def build_totp_uri(*, secret: str, email: str, username: str | None = None) -> str:
    """Build an otpauth URI for authenticator apps."""
    return _totp(secret).provisioning_uri(name=username or email, issuer_name=MFA_ISSUER)


async def create_login_challenge(redis: Redis | None, *, user_id: UUID4, transport: MfaTransport) -> str:
    """Create a short-lived one-time MFA login challenge token."""
    return await _store_pending_token(
        redis,
        kind="login-challenge",
        payload={"user_id": str(user_id), "transport": transport},
    )


async def create_oauth_handoff(redis: Redis | None, *, mfa_token: str) -> str:
    """Create a short-lived one-time OAuth handoff token for MFA completion."""
    return await _store_pending_token(
        redis,
        kind="oauth-handoff",
        payload={"mfa_token": mfa_token},
    )


async def consume_oauth_handoff(redis: Redis | None, token: str) -> str:
    """Consume a one-time OAuth MFA handoff token."""
    metadata = await _read_pending_token(redis, kind="oauth-handoff", token=token, consume=True)
    mfa_token = metadata.get("mfa_token")
    if not mfa_token:
        raise MfaChallengeInvalidError
    return mfa_token


async def consume_login_challenge(redis: Redis | None, token: str) -> MfaChallenge:
    """Consume a one-time MFA login challenge token."""
    metadata = await _read_pending_token(redis, kind="login-challenge", token=token, consume=True)
    return MfaChallenge(user_id=_parse_user_id(metadata), transport=_parse_transport(metadata))


async def get_login_challenge(redis: Redis | None, token: str) -> MfaChallenge:
    """Read an MFA login challenge without consuming it."""
    metadata = await _read_pending_token(redis, kind="login-challenge", token=token, consume=False)
    return MfaChallenge(user_id=_parse_user_id(metadata), transport=_parse_transport(metadata))


async def create_totp_setup(
    redis: Redis | None,
    *,
    user_id: UUID4,
    secret: str,
) -> str:
    """Create a short-lived one-time TOTP setup token."""
    return await _store_pending_token(
        redis,
        kind="totp-setup",
        payload={"user_id": str(user_id), "secret": secret},
    )


def _totp_setup_from_metadata(metadata: dict[str, str], *, user_id: UUID4 | None) -> TotpSetup:
    if user_id is not None and metadata.get("user_id") != str(user_id):
        raise MfaChallengeInvalidError
    secret = metadata.get("secret")
    if not secret:
        raise MfaChallengeInvalidError
    return TotpSetup(user_id=_parse_user_id(metadata), secret=secret)


async def get_totp_setup(redis: Redis | None, token: str, *, user_id: UUID4 | None = None) -> TotpSetup:
    """Read a pending TOTP setup without consuming it."""
    metadata = await _read_pending_token(redis, kind="totp-setup", token=token, consume=False)
    return _totp_setup_from_metadata(metadata, user_id=user_id)


async def consume_totp_setup(redis: Redis | None, token: str, *, user_id: UUID4 | None = None) -> TotpSetup:
    """Consume a one-time TOTP setup token for ``user_id``."""
    metadata = await _read_pending_token(redis, kind="totp-setup", token=token, consume=True)
    return _totp_setup_from_metadata(metadata, user_id=user_id)
