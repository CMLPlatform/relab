"""Tests for secure email identity canonicalization."""

from unittest.mock import patch

import pytest
from email_validator import EmailUndeliverableError

from app.api.auth.services import email_identity
from app.api.auth.services.email_identity import canonicalize_email
from app.core.config import Environment


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


async def test_has_deliverable_domain_skips_dns_outside_deployed_environments() -> None:
    """Dev and test runs must never touch a resolver."""
    with patch.object(email_identity, "validate_email") as validator:
        assert await email_identity.has_deliverable_domain("user@example.com") is True

    validator.assert_not_called()


@pytest.mark.parametrize(
    ("side_effect", "expected"),
    [
        (None, True),
        (EmailUndeliverableError("no mail exchanger"), False),
    ],
)
async def test_has_deliverable_domain_reports_mx_result(side_effect: Exception | None, *, expected: bool) -> None:
    """A domain with no mail exchanger is rejected; a resolvable one passes."""
    with (
        patch.object(email_identity.settings, "environment", Environment.PROD),
        patch.object(email_identity, "validate_email", side_effect=side_effect) as validator,
    ):
        assert await email_identity.has_deliverable_domain("user@example.com") is expected

    assert validator.call_args.kwargs["check_deliverability"] is True
