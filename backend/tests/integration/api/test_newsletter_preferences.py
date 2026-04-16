"""Behavior-focused tests for newsletter preference endpoints."""
# ruff: noqa: D103

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI
from sqlalchemy import select

from app.api.auth.models import User
from app.api.newsletter.models import NewsletterSubscriber
from tests.factories.models import UserFactory
from tests.fixtures.client import override_authenticated_user
from tests.integration.api._newsletter_support import HTTP_OK

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
async def newsletter_user(db_session: AsyncSession) -> User:
    return await UserFactory.create_async(session=db_session, is_active=True)


@pytest.fixture
async def newsletter_user_client(
    api_client: AsyncClient, newsletter_user: User, test_app: FastAPI
) -> AsyncGenerator[AsyncClient]:
    with override_authenticated_user(test_app, newsletter_user, verified=False, optional=False):
        yield api_client


@pytest.mark.asyncio
async def test_get_newsletter_preference_returns_subscribed_state(
    newsletter_user_client: AsyncClient,
    newsletter_user: User,
    db_session: AsyncSession,
) -> None:
    newsletter_user.email = "pref@example.com"
    db_session.add(newsletter_user)
    await db_session.flush()

    subscriber = NewsletterSubscriber(email=newsletter_user.email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await newsletter_user_client.get("/newsletter/me")

    assert response.status_code == HTTP_OK
    assert response.json()["email"] == newsletter_user.email
    assert response.json()["subscribed"] is True
    assert response.json()["is_confirmed"] is True


@pytest.mark.asyncio
async def test_enable_newsletter_preference_without_email_verification(
    newsletter_user_client: AsyncClient,
    newsletter_user: User,
    db_session: AsyncSession,
) -> None:
    newsletter_user.email = "signup@example.com"
    db_session.add(newsletter_user)
    await db_session.flush()

    response = await newsletter_user_client.put("/newsletter/me", json={"subscribed": True})

    assert response.status_code == HTTP_OK
    assert response.json()["subscribed"] is True
    assert response.json()["is_confirmed"] is True

    stored = await db_session.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == newsletter_user.email)
    )
    subscriber = stored.scalar_one_or_none()
    assert subscriber is not None
    assert subscriber.is_confirmed is True


@pytest.mark.asyncio
async def test_disable_newsletter_preference_removes_subscriber(
    newsletter_user_client: AsyncClient,
    newsletter_user: User,
    db_session: AsyncSession,
) -> None:
    newsletter_user.email = "leave@example.com"
    db_session.add(newsletter_user)
    await db_session.flush()

    subscriber = NewsletterSubscriber(email=newsletter_user.email, is_confirmed=True)
    db_session.add(subscriber)
    await db_session.flush()

    response = await newsletter_user_client.put("/newsletter/me", json={"subscribed": False})

    assert response.status_code == HTTP_OK
    assert response.json()["subscribed"] is False
    assert await db_session.get(NewsletterSubscriber, subscriber.id) is None
