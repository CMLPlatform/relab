"""Helpers for the private backend<->plugin device seam."""

from pydantic import TypeAdapter
from relab_rpi_cam_models import PairingClaimedRecord, PairingPendingRecord

_PAIRING_RECORD_ADAPTER = TypeAdapter(PairingPendingRecord | PairingClaimedRecord)


def parse_pairing_record(raw: str) -> PairingPendingRecord | PairingClaimedRecord:
    """Parse a Redis-stored pairing record into its typed model."""
    return _PAIRING_RECORD_ADAPTER.validate_json(raw)
