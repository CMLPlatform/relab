"""TOTP MFA helpers and short-lived MFA token storage."""

import hmac
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal
from uuid import UUID

import pyotp
from pydantic import UUID4

from app.api.auth.exceptions import MfaChallengeInvalidError
from app.api.auth.services.rate_limiter import LOGIN_RATE_LIMIT, limiter, rate_limit_bucket_key
from app.api.auth.services.token_store import read_token_metadata, store_new_token, token_fingerprint

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from app.api.auth.models import User
    from app.api.auth.services.user_manager import UserManager

MFA_TOKEN_BYTES = 32
TOTP_SECRET_CHARS = 32
TOTP_DIGITS = 6
TOTP_PERIOD_SECONDS = 30
TOTP_VALID_WINDOW = 1
MFA_TOKEN_TTL_SECONDS = 10 * 60
MFA_ISSUER = "Relab"
MFA_TOKEN_ATTEMPT_RATE_LIMIT = LOGIN_RATE_LIMIT
RECOVERY_CODE_COUNT = 10
RECOVERY_CODE_CHARS = 10
# RFC 4648 base32 alphabet minus padding: no 0/1/8/9 to avoid O/I/B/g confusion.
_RECOVERY_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

MfaTransport = Literal["bearer", "session"]
_PendingTokenKind = Literal["login-challenge", "totp-setup", "oauth-handoff"]
SESSION_TRANSPORT: MfaTransport = "session"


def _pending_token_key_prefix(kind: _PendingTokenKind) -> str:
    """Return the shared token-store prefix for one pending MFA token kind."""
    return f"auth:mfa:{kind}"


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


async def _store_pending_token(
    redis: Redis,
    *,
    kind: _PendingTokenKind,
    payload: dict[str, str],
) -> str:
    return await store_new_token(
        redis,
        key_prefix=_pending_token_key_prefix(kind),
        payload=payload,
        ttl_seconds=MFA_TOKEN_TTL_SECONDS,
        token_bytes=MFA_TOKEN_BYTES,
    )


async def _read_pending_token(
    redis: Redis,
    *,
    kind: _PendingTokenKind,
    token: str,
    consume: bool,
) -> dict[str, str]:
    metadata = await read_token_metadata(
        redis,
        key_prefix=_pending_token_key_prefix(kind),
        token=token,
        error_cls=MfaChallengeInvalidError,
        consume=consume,
    )
    return {key: str(value) for key, value in metadata.items()}


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


def _totp_used_key(user_id: UUID4, counter: int) -> str:
    return f"auth:mfa:totp-used:{user_id}:{counter}"


async def verify_totp_code_once(
    redis: Redis,
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
    return await burn_totp_counter(redis, user_id=user_id, counter=counter)


async def verify_totp_code(
    redis: Redis,
    *,
    user_id: UUID4,
    secret: str,
    code: str,
    for_time: int | None = None,
) -> int | None:
    """Verify a TOTP code without burning its time-step; return the matching counter.

    Callers must ``burn_totp_counter`` after their own side effects succeed, so a
    failed side effect doesn't lock the still-valid code out of an immediate retry.
    """
    counter = _matching_totp_counter(secret, code, for_time=for_time)
    if counter is None:
        return None
    if await redis.exists(_totp_used_key(user_id, counter)):
        return None
    return counter


async def burn_totp_counter(redis: Redis, *, user_id: UUID4, counter: int) -> bool:
    """Mark a TOTP time-step as used; return False when it was already burned."""
    ttl = (TOTP_VALID_WINDOW + 2) * TOTP_PERIOD_SECONDS
    return bool(await redis.set(_totp_used_key(user_id, counter), "1", ex=ttl, nx=True))


def build_totp_uri(*, secret: str, email: str, username: str | None = None) -> str:
    """Build an otpauth URI for authenticator apps."""
    return _totp(secret).provisioning_uri(name=username or email, issuer_name=MFA_ISSUER)


async def create_login_challenge(redis: Redis, *, user_id: UUID4, transport: MfaTransport) -> str:
    """Create a short-lived one-time MFA login challenge token."""
    return await _store_pending_token(
        redis,
        kind="login-challenge",
        payload={"user_id": str(user_id), "transport": transport},
    )


async def create_oauth_handoff(redis: Redis, *, mfa_token: str) -> str:
    """Create a short-lived one-time OAuth handoff token for MFA completion."""
    return await _store_pending_token(
        redis,
        kind="oauth-handoff",
        payload={"mfa_token": mfa_token},
    )


async def consume_oauth_handoff(redis: Redis, token: str) -> str:
    """Consume a one-time OAuth MFA handoff token."""
    metadata = await _read_pending_token(redis, kind="oauth-handoff", token=token, consume=True)
    mfa_token = metadata.get("mfa_token")
    if not mfa_token:
        raise MfaChallengeInvalidError
    return mfa_token


async def consume_login_challenge(redis: Redis, token: str) -> MfaChallenge:
    """Consume a one-time MFA login challenge token."""
    metadata = await _read_pending_token(redis, kind="login-challenge", token=token, consume=True)
    return MfaChallenge(user_id=_parse_user_id(metadata), transport=_parse_transport(metadata))


async def get_login_challenge(redis: Redis, token: str) -> MfaChallenge:
    """Read an MFA login challenge without consuming it."""
    metadata = await _read_pending_token(redis, kind="login-challenge", token=token, consume=False)
    return MfaChallenge(user_id=_parse_user_id(metadata), transport=_parse_transport(metadata))


async def create_totp_setup(
    redis: Redis,
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


async def get_totp_setup(redis: Redis, token: str, *, user_id: UUID4 | None = None) -> TotpSetup:
    """Read a pending TOTP setup without consuming it."""
    metadata = await _read_pending_token(redis, kind="totp-setup", token=token, consume=False)
    return _totp_setup_from_metadata(metadata, user_id=user_id)


async def consume_totp_setup(redis: Redis, token: str, *, user_id: UUID4 | None = None) -> TotpSetup:
    """Consume a one-time TOTP setup token for ``user_id``."""
    metadata = await _read_pending_token(redis, kind="totp-setup", token=token, consume=True)
    return _totp_setup_from_metadata(metadata, user_id=user_id)


async def enable_totp(user_manager: UserManager, user: User, secret: str) -> User:
    """Persist a confirmed TOTP enrollment."""
    user.mfa_totp_secret = secret
    user.mfa_enabled = True
    user.mfa_confirmed_at = datetime.now(UTC)
    user_manager.user_db.session.add(user)
    await user_manager.user_db.session.commit()
    await user_manager.user_db.session.refresh(user)
    return user


async def clear_totp(user_manager: UserManager, user: User) -> None:
    """Clear a user's TOTP enrollment and its now-useless recovery codes."""
    user.mfa_totp_secret = None
    user.mfa_enabled = False
    user.mfa_confirmed_at = None
    user.mfa_recovery_codes = []
    user_manager.user_db.session.add(user)
    await user_manager.user_db.session.commit()


def _new_recovery_code() -> str:
    """Return one high-entropy recovery code, grouped for readability."""
    raw = "".join(secrets.choice(_RECOVERY_CODE_ALPHABET) for _ in range(RECOVERY_CODE_CHARS))
    return f"{raw[:5]}-{raw[5:]}"


def normalize_recovery_code(code: str) -> str:
    """Drop case and formatting so grouping/separators don't affect matching."""
    return "".join(char for char in code.upper() if char.isalnum())


def hash_recovery_code(code: str) -> str:
    """Hash a recovery code for storage (fast hash is fine: codes are high-entropy)."""
    return token_fingerprint(normalize_recovery_code(code))


def generate_recovery_codes() -> tuple[list[str], list[str]]:
    """Return (plaintext codes shown once, hashes to persist)."""
    codes = [_new_recovery_code() for _ in range(RECOVERY_CODE_COUNT)]
    return codes, [hash_recovery_code(code) for code in codes]


def consume_recovery_code(stored_hashes: list[str], code: str) -> list[str] | None:
    """Return the remaining hashes if ``code`` matched one (dropping it), else None."""
    target = hash_recovery_code(code)
    matched = False
    remaining: list[str] = []
    for stored in stored_hashes:
        if not matched and hmac.compare_digest(stored, target):
            matched = True
            continue
        remaining.append(stored)
    return remaining if matched else None


async def set_recovery_codes(user_manager: UserManager, user: User, hashes: list[str]) -> None:
    """Persist the current set of recovery-code hashes for a user."""
    user.mfa_recovery_codes = hashes
    user_manager.user_db.session.add(user)
    await user_manager.user_db.session.commit()
