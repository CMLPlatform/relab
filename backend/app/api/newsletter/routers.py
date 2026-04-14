"""Newsletter subscription endpoints."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Security
from fastapi.params import Body
from fastapi_pagination import Page
from pydantic import EmailStr
from sqlalchemy import select

from app.api.auth.dependencies import CurrentActiveUserDep, current_active_superuser, current_active_user
from app.api.common.crud.persistence import commit_and_refresh, delete_and_commit
from app.api.common.crud.query import page_models
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.newsletter.examples import (
    NEWSLETTER_EMAIL_BODY_OPENAPI_EXAMPLES,
    NEWSLETTER_TOKEN_BODY_OPENAPI_EXAMPLES,
)
from app.api.newsletter.exceptions import (
    NewsletterAlreadyConfirmedError,
    NewsletterAlreadySubscribedError,
    NewsletterConfirmationResentError,
    NewsletterInvalidConfirmationTokenError,
    NewsletterInvalidUnsubscribeTokenError,
    NewsletterSubscriberNotFoundError,
)
from app.api.newsletter.models import NewsletterSubscriber
from app.api.newsletter.schemas import NewsletterPreferenceRead, NewsletterPreferenceUpdate, NewsletterSubscriberRead
from app.api.newsletter.utils.emails import (
    send_newsletter_subscription_email,
    send_newsletter_unsubscription_request_email,
)
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token, verify_jwt_token

### Main backend router ###
backend_router = APIRouter(prefix="/newsletter")


async def _get_subscriber_by_email(db: AsyncSessionDep, email: str) -> NewsletterSubscriber | None:
    statement = select(NewsletterSubscriber).where(NewsletterSubscriber.email == email)
    return (await db.execute(statement)).scalars().unique().one_or_none()


def _newsletter_preference_read(
    *,
    email: str,
    subscriber: NewsletterSubscriber | None,
) -> NewsletterPreferenceRead:
    return NewsletterPreferenceRead(
        email=email,
        subscribed=subscriber is not None,
        is_confirmed=subscriber.is_confirmed if subscriber else False,
    )


@backend_router.post("/subscribe", status_code=201, response_model=NewsletterSubscriberRead)
async def subscribe_to_newsletter(
    email: Annotated[
        EmailStr,
        Body(description="Email address to subscribe", openapi_examples=NEWSLETTER_EMAIL_BODY_OPENAPI_EXAMPLES),
    ],
    db: AsyncSessionDep,
    background_tasks: BackgroundTasks,
) -> NewsletterSubscriber:
    """Subscribe to the newsletter to receive updates about the app launch."""
    existing_subscriber = await _get_subscriber_by_email(db, email)

    if existing_subscriber:
        if existing_subscriber.is_confirmed:
            raise NewsletterAlreadySubscribedError

        token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
        await send_newsletter_subscription_email(email, token, background_tasks=background_tasks)
        raise NewsletterConfirmationResentError

    new_subscriber = NewsletterSubscriber(email=email)
    await commit_and_refresh(db, new_subscriber)

    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    await send_newsletter_subscription_email(email, token, background_tasks=background_tasks)

    return new_subscriber


@backend_router.post("/confirm", status_code=200, response_model=NewsletterSubscriberRead)
async def confirm_newsletter_subscription(
    token: Annotated[
        str,
        Body(
            description="Confirmation token from the subscription email",
            openapi_examples=NEWSLETTER_TOKEN_BODY_OPENAPI_EXAMPLES,
        ),
    ],
    db: AsyncSessionDep,
) -> NewsletterSubscriber:
    """Confirm the newsletter subscription."""
    email = verify_jwt_token(token, JWTType.NEWSLETTER_CONFIRMATION)
    if not email:
        raise NewsletterInvalidConfirmationTokenError

    existing_subscriber = await _get_subscriber_by_email(db, email)

    if not existing_subscriber:
        raise NewsletterSubscriberNotFoundError

    if existing_subscriber.is_confirmed:
        raise NewsletterAlreadyConfirmedError

    existing_subscriber.is_confirmed = True
    return await commit_and_refresh(db, existing_subscriber, add_before_commit=False)


@backend_router.post("/request-unsubscribe", status_code=200)
async def request_unsubscribe(
    email: Annotated[
        EmailStr,
        Body(description="Email address to unsubscribe", openapi_examples=NEWSLETTER_EMAIL_BODY_OPENAPI_EXAMPLES),
    ],
    db: AsyncSessionDep,
    background_tasks: BackgroundTasks,
) -> dict:
    """Request to unsubscribe by sending an email with unsubscribe link."""
    existing_subscriber = await _get_subscriber_by_email(db, email)

    if not existing_subscriber:
        return {"message": "If you are subscribed, we've sent an unsubscribe link to your email."}

    token = create_jwt_token(email, JWTType.NEWSLETTER_UNSUBSCRIBE)
    await send_newsletter_unsubscription_request_email(email, token, background_tasks=background_tasks)

    return {"message": "If you are subscribed, we've sent an unsubscribe link to your email."}


@backend_router.post("/unsubscribe", status_code=204)
async def unsubscribe_with_token(
    token: Annotated[
        str,
        Body(
            description="Unsubscribe token from the email link",
            openapi_examples=NEWSLETTER_TOKEN_BODY_OPENAPI_EXAMPLES,
        ),
    ],
    db: AsyncSessionDep,
) -> None:
    """One-click unsubscribe from newsletter using a token."""
    email = verify_jwt_token(token, JWTType.NEWSLETTER_UNSUBSCRIBE)
    if not email:
        raise NewsletterInvalidUnsubscribeTokenError

    existing_subscriber = await _get_subscriber_by_email(db, email)

    if not existing_subscriber:
        raise NewsletterSubscriberNotFoundError

    await delete_and_commit(db, existing_subscriber)


### Private router for user-specific newsletter preferences ##
private_router = APIRouter(prefix="/newsletter", dependencies=[Security(current_active_user)])


@private_router.get("/me", response_model=NewsletterPreferenceRead)
async def get_newsletter_preference(
    current_user: CurrentActiveUserDep, db: AsyncSessionDep
) -> NewsletterPreferenceRead:
    """Return the logged-in user's newsletter preference."""
    existing_subscriber = await _get_subscriber_by_email(db, current_user.email)
    return _newsletter_preference_read(email=current_user.email, subscriber=existing_subscriber)


@private_router.put("/me", response_model=NewsletterPreferenceRead)
async def update_newsletter_preference(
    preference: NewsletterPreferenceUpdate,
    current_user: CurrentActiveUserDep,
    db: AsyncSessionDep,
) -> NewsletterPreferenceRead:
    """Update the logged-in user's newsletter preference without email verification."""
    existing_subscriber = await _get_subscriber_by_email(db, current_user.email)

    if preference.subscribed:
        if existing_subscriber is None:
            existing_subscriber = NewsletterSubscriber(email=current_user.email, is_confirmed=True)
        else:
            existing_subscriber.is_confirmed = True
        await commit_and_refresh(db, existing_subscriber)
        return _newsletter_preference_read(email=current_user.email, subscriber=existing_subscriber)

    if existing_subscriber is not None:
        await delete_and_commit(db, existing_subscriber)

    return _newsletter_preference_read(email=current_user.email, subscriber=None)


### Admin router ###
admin_router = APIRouter(prefix="/admin/newsletter", dependencies=[Security(current_active_superuser)])


@admin_router.get("/subscribers", response_model=Page[NewsletterSubscriberRead])
async def get_subscribers(db: AsyncSessionDep) -> Page[NewsletterSubscriber]:
    """Get all newsletter subscribers. Only accessible by superusers."""
    return await page_models(db, NewsletterSubscriber, read_schema=NewsletterSubscriberRead)


### Router registration ###
router = APIRouter()

router.include_router(backend_router)
router.include_router(private_router)
router.include_router(admin_router)
