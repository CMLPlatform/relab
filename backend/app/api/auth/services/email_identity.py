"""Email identity canonicalization helpers."""

from __future__ import annotations

import unicodedata

from email_validator import EmailNotValidError, validate_email


def canonicalize_email(email: str) -> str:
    """Return RELab's conservative email comparison key."""
    try:
        validated = validate_email(str(email), check_deliverability=False)
    except EmailNotValidError as exc:
        msg = "Invalid email address"
        raise ValueError(msg) from exc

    local_part = unicodedata.normalize("NFC", validated.local_part).casefold()
    domain = (validated.ascii_domain or validated.domain).casefold()
    return f"{local_part}@{domain}"


def canonical_email_domain(email: str) -> str:
    """Return the canonical domain portion for policy checks."""
    return canonicalize_email(email).rsplit("@", 1)[1]
