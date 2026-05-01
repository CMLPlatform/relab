"""Tests for secure email identity canonicalization."""
# spell-checker: ignore bücher, bcher

from __future__ import annotations

import pytest

from app.api.auth.services.email_identity import canonicalize_email


@pytest.mark.parametrize(
    ("raw_email", "expected"),
    [
        ("User@Example.COM", "user@example.com"),
        ("u\u0308ser@Example.com", "üser@example.com"),
        ("user@bücher.example", "user@xn--bcher-kva.example"),
        ("First.Last+tag@gmail.com", "first.last+tag@gmail.com"),
    ],
)
def test_canonicalize_email_uses_conservative_policy(raw_email: str, expected: str) -> None:
    """Canonicalization should be consistent without provider-specific alias stripping."""
    assert canonicalize_email(raw_email) == expected
