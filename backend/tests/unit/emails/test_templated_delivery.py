"""Tests for the typed shared email delivery boundary."""

from unittest.mock import AsyncMock

import pytest

from app.api.auth.services.email.service import send_templated_email
from app.api.auth.services.email.templates import REGISTRATION_TEMPLATE


async def test_send_templated_email_rejects_missing_required_context() -> None:
    """Template rendering should fail fast when required context is missing."""
    provider = AsyncMock()

    with pytest.raises(ValueError, match="verification_link"):
        await send_templated_email(
            to_email="user@example.com",
            subject="Welcome",
            template_name=REGISTRATION_TEMPLATE,
            template_body={"username": "tester"},
            provider=provider,
        )

    provider.send.assert_not_awaited()
