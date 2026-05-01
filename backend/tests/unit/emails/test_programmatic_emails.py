"""Tests for programmatic email sending functionality."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from faker import Faker
from fastapi import BackgroundTasks

from app.api.auth.config import settings as auth_settings
from app.api.auth.services.email import (
    generate_token_link,
    send_email_changed_notification,
    send_password_reset_confirmation_email,
    send_post_verification_email,
    send_registration_email,
    send_reset_password_email,
    send_verification_email,
)
from app.core.config import settings as core_settings

if TYPE_CHECKING:
    from collections.abc import Callable
    from unittest.mock import AsyncMock

fake = Faker("en_US")

# Constants for magic values
DOUBLE_SLASH = "//"
PROTO_SEP = "://"


@pytest.fixture
def email_data() -> dict[str, str]:
    """Return common data for email tests."""
    return {
        "email": fake.email(),
        "username": fake.user_name(),
        "token": fake.uuid4(),
    }


### Token Link Generation Tests ###
def test_generate_token_link_default_base_url() -> None:
    """Test token link generation with default base URL from core settings."""
    token = fake.uuid4()
    route = "/verify"

    link = generate_token_link(token, route)

    parsed = urlparse(link)
    query_params = parse_qs(parsed.query)

    assert link.startswith(str(core_settings.frontend_app_url))
    assert parsed.path == route
    assert query_params["token"] == [token]


def test_generate_token_link_custom_base_url() -> None:
    """Test token link generation with custom base URL."""
    token = fake.uuid4()
    route = "/reset-password"
    custom_base_url = fake.url()

    link = generate_token_link(token, route, base_url=custom_base_url)

    parsed = urlparse(link)
    query_params = parse_qs(parsed.query)

    assert link.startswith(custom_base_url)
    assert parsed.path == route
    assert query_params["token"] == [token]


def test_generate_token_link_with_trailing_slash() -> None:
    """Test that token links are generated correctly regardless of trailing slashes."""
    token = fake.uuid4()
    route = "/verify"
    base_url_with_slash = f"{fake.url()}//"

    link = generate_token_link(token, route, base_url=base_url_with_slash)

    # Should not have double slashes
    assert DOUBLE_SLASH not in link.split(PROTO_SEP)[1]
    # Should still have the correct route
    assert urlparse(link).path == route


### Registration Email Tests ###
async def test_send_registration_email(email_data: dict[str, str], mock_email_sending: AsyncMock) -> None:
    """Test registration email is sent."""
    await send_registration_email(email_data["email"], email_data["username"], email_data["token"])
    mock_email_sending.assert_called_once()


async def test_send_registration_email_sets_reply_to(email_data: dict[str, str], mock_email_sending: AsyncMock) -> None:
    """Test registration emails include the configured reply-to address."""
    await send_registration_email(email_data["email"], email_data["username"], email_data["token"])

    await_args = mock_email_sending.await_args
    reply_to = auth_settings.email.reply_to

    assert await_args is not None
    message = await_args.args[0]
    assert message.reply_to
    assert reply_to is not None
    assert message.reply_to[0] == reply_to


async def test_send_registration_email_no_username(email_data: dict[str, str], mock_email_sending: AsyncMock) -> None:
    """Test registration email works without username."""
    await send_registration_email(email_data["email"], None, email_data["token"])
    mock_email_sending.assert_called_once()


async def test_send_registration_email_uses_template_contract(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Registration emails pass the expected template and context."""
    await send_registration_email(email_data["email"], email_data["username"], email_data["token"])

    await_args = mock_email_sending.await_args
    assert await_args is not None
    message = await_args.args[0]
    assert email_data["username"] in message.html_body
    assert generate_token_link(email_data["token"], "/verify") in message.html_body


async def test_send_registration_email_with_background_tasks(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Test registration email queues task instead of sending immediately."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_registration_email(
        email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
    )

    # When background_tasks is provided, it should queue, not send
    background_tasks.add_task.assert_called_once()
    mock_email_sending.assert_not_called()


### Password Reset Email Tests ###
async def test_send_reset_password_email(email_data: dict[str, str], mock_email_sending: AsyncMock) -> None:
    """Test password reset email is sent."""
    await send_reset_password_email(email_data["email"], email_data["username"], email_data["token"])
    mock_email_sending.assert_called_once()


async def test_send_reset_password_email_uses_template_contract(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Password-reset emails pass the expected template and context."""
    await send_reset_password_email(email_data["email"], email_data["username"], email_data["token"])

    await_args = mock_email_sending.await_args
    assert await_args is not None
    message = await_args.args[0]
    assert email_data["username"] in message.html_body
    assert generate_token_link(email_data["token"], "/reset-password") in message.html_body


async def test_send_reset_password_email_with_background_tasks(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Test password reset email queues task when background_tasks provided."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_reset_password_email(
        email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
    )

    background_tasks.add_task.assert_called_once()
    mock_email_sending.assert_not_called()


### Verification Email Tests ###
async def test_send_verification_email(email_data: dict[str, str], mock_email_sending: AsyncMock) -> None:
    """Test verification email is sent."""
    await send_verification_email(email_data["email"], email_data["username"], email_data["token"])
    mock_email_sending.assert_called_once()


async def test_send_verification_email_uses_template_contract(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Verification emails pass the expected template and context."""
    await send_verification_email(email_data["email"], email_data["username"], email_data["token"])

    await_args = mock_email_sending.await_args
    assert await_args is not None
    message = await_args.args[0]
    assert email_data["username"] in message.html_body
    assert generate_token_link(email_data["token"], "/verify") in message.html_body


async def test_send_verification_email_with_background_tasks(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Test verification email queues task when background_tasks provided."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_verification_email(
        email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
    )

    background_tasks.add_task.assert_called_once()
    mock_email_sending.assert_not_called()


### Post-Verification Email Tests ###
async def test_send_post_verification_email(email_data: dict[str, str], mock_email_sending: AsyncMock) -> None:
    """Test post-verification email is sent."""
    await send_post_verification_email(email_data["email"], email_data["username"])
    mock_email_sending.assert_called_once()


async def test_send_post_verification_email_uses_template_contract(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Post-verification emails pass the expected template and context."""
    await send_post_verification_email(email_data["email"], email_data["username"])

    await_args = mock_email_sending.await_args
    assert await_args is not None
    message = await_args.args[0]
    assert email_data["username"] in message.html_body


async def test_send_post_verification_email_no_username(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Test post-verification email works without username."""
    await send_post_verification_email(email_data["email"], None)
    mock_email_sending.assert_called_once()


async def test_send_post_verification_email_with_background_tasks(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Test post-verification email queues task when background_tasks provided."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_post_verification_email(email_data["email"], email_data["username"], background_tasks=background_tasks)

    background_tasks.add_task.assert_called_once()
    mock_email_sending.assert_not_called()


async def test_send_email_changed_notification_uses_plain_message(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Email-change notifications should not include reset or verification tokens."""
    await send_email_changed_notification(email_data["email"])

    await_args = mock_email_sending.await_args
    assert await_args is not None
    message = await_args.args[0]
    assert message.subject == "Your RELab account email changed"
    assert "token=" not in message.html_body


async def test_send_password_reset_confirmation_email_uses_plain_safe_message(
    email_data: dict[str, str], mock_email_sending: AsyncMock
) -> None:
    """Password-reset confirmations should not include credentials, tokens, or reset URLs."""
    await send_password_reset_confirmation_email(email_data["email"], email_data["username"])

    await_args = mock_email_sending.await_args
    assert await_args is not None
    message = await_args.args[0]
    assert message.subject == "Your RELab password was reset"
    assert email_data["username"] in message.html_body
    assert email_data["token"] not in message.html_body
    assert "token=" not in message.html_body
    assert "/reset-password" not in message.html_body
    assert "password123" not in message.html_body


### Parametrized Integration Tests ###
@pytest.mark.parametrize(
    ("email_func", "needs_token"),
    [
        (send_registration_email, True),
        (send_reset_password_email, True),
        (send_password_reset_confirmation_email, False),
        (send_verification_email, True),
        (send_post_verification_email, False),
    ],
)
async def test_all_email_functions_send_emails(
    email_data: dict[str, str],
    mock_email_sending: AsyncMock,
    email_func: Callable[..., Any],
    *,
    needs_token: bool,
) -> None:
    """Test that all email functions successfully send emails."""
    # Call function with appropriate arguments
    if needs_token:
        await email_func(email_data["email"], email_data["username"], email_data["token"])
    else:
        await email_func(email_data["email"], email_data["username"])

    # Verify email was sent
    mock_email_sending.assert_called_once()


@pytest.mark.parametrize(
    ("email_func", "needs_token"),
    [
        (send_registration_email, True),
        (send_reset_password_email, True),
        (send_password_reset_confirmation_email, False),
        (send_verification_email, True),
        (send_post_verification_email, False),
    ],
)
async def test_all_email_functions_support_background_tasks(
    email_data: dict[str, str],
    mock_email_sending: AsyncMock,
    email_func: Callable[..., Any],
    *,
    needs_token: bool,
) -> None:
    """Test that all email functions support background tasks."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    # Call function with background tasks
    if needs_token:
        await email_func(
            email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
        )
    else:
        await email_func(email_data["email"], email_data["username"], background_tasks=background_tasks)

    # Verify task was queued, not sent immediately
    background_tasks.add_task.assert_called_once()
    mock_email_sending.assert_not_called()
