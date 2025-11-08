"""Tests for programmatic email sending functionality."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlparse

import pytest
from faker import Faker
from fastapi import BackgroundTasks

from app.api.auth.utils.programmatic_emails import (
    generate_token_link,
    send_post_verification_email,
    send_registration_email,
    send_reset_password_email,
    send_verification_email,
)
from app.core.config import settings as core_settings

fake = Faker()


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
    assert "//" not in link.replace("https://", "")  # noqa: PLR2004 # Magic value for double slash
    # Should still have the correct route
    assert urlparse(link).path == route


### Registration Email Tests ###
@pytest.mark.asyncio
async def test_send_registration_email(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test registration email is sent."""
    await send_registration_email(email_data["email"], email_data["username"], email_data["token"])
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
async def test_send_registration_email_no_username(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test registration email works without username."""
    await send_registration_email(email_data["email"], None, email_data["token"])
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
async def test_send_registration_email_with_background_tasks(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test registration email queues task instead of sending immediately."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_registration_email(
        email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
    )

    # When background_tasks is provided, it should queue, not send
    background_tasks.add_task.assert_called_once()
    mock_email_sender.assert_not_called()


### Password Reset Email Tests ###
@pytest.mark.asyncio
async def test_send_reset_password_email(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test password reset email is sent."""
    await send_reset_password_email(email_data["email"], email_data["username"], email_data["token"])
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
async def test_send_reset_password_email_with_background_tasks(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test password reset email queues task when background_tasks provided."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_reset_password_email(
        email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
    )

    background_tasks.add_task.assert_called_once()
    mock_email_sender.assert_not_called()


### Verification Email Tests ###
@pytest.mark.asyncio
async def test_send_verification_email(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test verification email is sent."""
    await send_verification_email(email_data["email"], email_data["username"], email_data["token"])
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
async def test_send_verification_email_with_background_tasks(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test verification email queues task when background_tasks provided."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_verification_email(
        email_data["email"], email_data["username"], email_data["token"], background_tasks=background_tasks
    )

    background_tasks.add_task.assert_called_once()
    mock_email_sender.assert_not_called()


### Post-Verification Email Tests ###
@pytest.mark.asyncio
async def test_send_post_verification_email(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test post-verification email is sent."""
    await send_post_verification_email(email_data["email"], email_data["username"])
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
async def test_send_post_verification_email_no_username(email_data: dict, mock_email_sender: AsyncMock) -> None:
    """Test post-verification email works without username."""
    await send_post_verification_email(email_data["email"], None)
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
async def test_send_post_verification_email_with_background_tasks(
    email_data: dict, mock_email_sender: AsyncMock
) -> None:
    """Test post-verification email queues task when background_tasks provided."""
    background_tasks = MagicMock(spec=BackgroundTasks)

    await send_post_verification_email(email_data["email"], email_data["username"], background_tasks=background_tasks)

    background_tasks.add_task.assert_called_once()
    mock_email_sender.assert_not_called()


### Parametrized Integration Tests ###
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("email_func", "needs_token"),
    [
        (send_registration_email, True),
        (send_reset_password_email, True),
        (send_verification_email, True),
        (send_post_verification_email, False),
    ],
)
async def test_all_email_functions_send_emails(
    email_data: dict,
    mock_email_sender: AsyncMock,
    email_func: Any,
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
    mock_email_sender.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("email_func", "needs_token"),
    [
        (send_registration_email, True),
        (send_reset_password_email, True),
        (send_verification_email, True),
        (send_post_verification_email, False),
    ],
)
async def test_all_email_functions_support_background_tasks(
    email_data: dict,
    mock_email_sender: AsyncMock,
    email_func: Any,
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
    mock_email_sender.assert_not_called()
