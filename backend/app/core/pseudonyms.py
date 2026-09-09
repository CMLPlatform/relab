"""Keyed pseudonyms for values that must be correlated but not identified.

A rate-limit bucket and a log line both need to answer "is this the same subject as the
one a moment ago?" without carrying the subject itself. A keyed digest answers exactly
that: stable for a given value, useless to anyone without the key, and not reversible by
guessing the input space the way a bare hash of an email or an IP is.

Masking is the weaker alternative it replaces: `j***@gmail.com` still carries the domain,
and with a timestamp and the surrounding fields that is often enough to re-identify one
person in a small research population.
"""

import hashlib
import hmac

from app.core.config import settings

# Long enough that a collision is not a practical concern for correlating log lines or
# bucketing a limiter, short enough to read. Truncation costs nothing here: the digest is
# an opaque label, never a secret or a signature anyone verifies.
LOG_TOKEN_LENGTH = 16


def keyed_digest(namespace: str, value: str, *, length: int | None = None) -> str:
    """Return a stable keyed digest of ``value``, scoped to ``namespace``.

    The namespace is signed too, so the same value under two namespaces never produces
    one digest — a rate-limit bucket cannot be correlated against a log token.
    """
    normalized = value.strip().casefold()
    if not normalized:
        return "missing"
    secret = settings.cache_signing_secret.get_secret_value().encode("utf-8")
    digest = hmac.new(secret, f"{namespace}:{normalized}".encode(), hashlib.sha256).hexdigest()
    return digest[:length] if length else digest
