"""Email identity canonicalization helpers."""

import asyncio
import unicodedata

from email_validator import EmailNotValidError, validate_email

from app.core.config import Environment, settings

DELIVERABILITY_DNS_TIMEOUT_SECONDS = 5


def canonicalize_email(email: str) -> str:
    """Return Relab's conservative email comparison key."""
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


async def has_deliverable_domain(email: str) -> bool:
    """Check the address's domain publishes a mail exchanger.

    DNS only (MX, with the A/AAAA fallback and null-MX/SPF-reject rules from RFC 5321
    and RFC 7505) — no SMTP probe of the mailbox itself, which the registration
    verification email already establishes.

    Measured on this network: 3-21 ms on a first lookup and under 2 ms once the
    resolver has the record, for real domains and for one that does not exist. Cheap
    enough to leave inline, which it has to be anyway — the answer gates the request.

    NOTE: DNS timeouts and unreachable nameservers pass; ``email_validator`` reports
    those as unknown deliverability rather than raising, so a resolver outage cannot
    block registration. Skipped outside deployed environments so tests and offline
    development never depend on a resolver, mirroring ``init_email_checker``.
    """
    if settings.environment in (Environment.DEV, Environment.TESTING):
        return True

    try:
        await asyncio.to_thread(
            validate_email,
            str(email),
            check_deliverability=True,
            timeout=DELIVERABILITY_DNS_TIMEOUT_SECONDS,
        )
    except EmailNotValidError:
        return False
    return True
