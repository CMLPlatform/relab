"""Tests for email template rendering."""

import pytest

from app.api.auth.services.email.templates import REGISTRATION_TEMPLATE, render_email_template


def test_render_email_template_includes_context_values() -> None:
    """Rendering should interpolate the typed template context into HTML."""
    html = render_email_template(
        REGISTRATION_TEMPLATE,
        {
            "username": "Ada",
            "verification_link": "https://app.example.test/verify?token=abc",
        },
    )

    assert "Ada" in html
    assert "https://app.example.test/verify?token=abc" in html


def test_render_email_template_rejects_missing_required_context() -> None:
    """Missing context should fail before any provider sends."""
    with pytest.raises(ValueError, match="verification_link"):
        render_email_template(REGISTRATION_TEMPLATE, {"username": "Ada"})
