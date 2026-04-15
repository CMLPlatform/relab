"""Helpers for the private backend<->plugin device seam."""

from __future__ import annotations

from pydantic import TypeAdapter
from relab_rpi_cam_models import (
    DevicePublicKeyJWK,
    PairingClaimedBootstrap,
    PairingClaimedRecord,
    PairingPendingRecord,
    RelayAuthScheme,
)

_PAIRING_RECORD_ADAPTER = TypeAdapter(PairingPendingRecord | PairingClaimedRecord)


def parse_pairing_record(raw: str) -> PairingPendingRecord | PairingClaimedRecord:
    """Parse a Redis-stored pairing record into its typed model."""
    return _PAIRING_RECORD_ADAPTER.validate_json(raw)


def dump_pairing_record(record: PairingPendingRecord | PairingClaimedRecord) -> str:
    """Serialize a typed pairing record for Redis storage."""
    return record.model_dump_json(exclude_none=True)


def build_waiting_record(
    *,
    rpi_fingerprint: str,
    public_key_jwk: DevicePublicKeyJWK,
    key_id: str,
) -> PairingPendingRecord:
    """Build the waiting-state record stored before claim."""
    return PairingPendingRecord(
        rpi_fingerprint=rpi_fingerprint,
        public_key_jwk=public_key_jwk,
        key_id=key_id,
    )


def build_claimed_bootstrap(
    *,
    camera_id: str,
    ws_url: str,
    key_id: str,
    auth_scheme: RelayAuthScheme = RelayAuthScheme.DEVICE_ASSERTION,
) -> PairingClaimedBootstrap:
    """Build the backend-owned relay bootstrap payload returned to the Pi."""
    return PairingClaimedBootstrap(camera_id=camera_id, ws_url=ws_url, key_id=key_id, auth_scheme=auth_scheme)


def build_claimed_record(payload: PairingClaimedBootstrap) -> PairingClaimedRecord:
    """Promote a claimed bootstrap payload into the Redis-stored paired record."""
    return PairingClaimedRecord(**payload.model_dump())
