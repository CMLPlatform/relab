"""Newsletter subscription endpoints."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Security
from fastapi.params import Body
from fastapi_pagination import Page
from pydantic import EmailStr
from sqlalchemy import Select, select

from app.api.auth.dependencies import CurrentActiveUserDep, current_active_superuser, current_active_user
from app.api.common.crud.pagination import paginate_select
from app.api.common.crud.persistence import commit_and_refresh, delete_and_commit
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
    """Return the subscriber row for one email address."""
    statement = select(NewsletterSubscriber).where(NewsletterSubscriber.email == email)
    return (await db.execute(statement)).scalars().unique().one_or_none()


def _newsletter_preference_read(
    *,
    email: str,
    subscriber: NewsletterSubscriber | None,
) -> NewsletterPreferenceRead:
    """Build the newsletter preference response for one email address."""
    return NewsletterPreferenceRead(
        email=email,
        subscribed=subscriber is not None,
        is_confirmed=subscriber.is_confirmed if subscriber else False,
    )


def _safe_unsubscribe_message() -> dict[str, str]:
    """Return the privacy-preserving unsubscribe response."""
    return {"message": "If you are subscribed, we've sent an unsubscribe link to your email."}


async def _send_confirmation_email(email: str, background_tasks: BackgroundTasks) -> None:
    """Send a newsletter confirmation email."""
    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    await send_newsletter_subscription_email(email, token, background_tasks=background_tasks)


async def _create_or_resend_subscriber(
    db: AsyncSessionDep,
    *,
    email: str,
    background_tasks: BackgroundTasks,
) -> NewsletterSubscriber:
    """Create a new subscriber or resend confirmation for an existing unconfirmed one."""
    existing_subscriber = await _get_subscriber_by_email(db, email)
    if existing_subscriber is None:
        new_subscriber = NewsletterSubscriber(email=email)
        await commit_and_refresh(db, new_subscriber)
        await _send_confirmation_email(email, background_tasks)
        return new_subscriber
    if existing_subscriber.is_confirmed:
        raise NewsletterAlreadySubscribedError
    await _send_confirmation_email(email, background_tasks)
    raise NewsletterConfirmationResentError


async def _confirm_subscriber(db: AsyncSessionDep, *, token: str) -> NewsletterSubscriber:
    """Confirm a subscriber from a valid confirmation token."""
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


async def _unsubscribe_subscriber(db: AsyncSessionDep, *, token: str) -> None:
    """Delete a subscriber using a valid unsubscribe token."""
    email = verify_jwt_token(token, JWTType.NEWSLETTER_UNSUBSCRIBE)
    if not email:
        raise NewsletterInvalidUnsubscribeTokenError
    existing_subscriber = await _get_subscriber_by_email(db, email)
    if not existing_subscriber:
        raise NewsletterSubscriberNotFoundError
    await delete_and_commit(db, existing_subscriber)


async def _set_newsletter_preference(
    db: AsyncSessionDep,
    *,
    email: str,
    subscribed: bool,
) -> NewsletterPreferenceRead:
    """Create/update/delete the subscriber row for a user's preference."""
    existing_subscriber = await _get_subscriber_by_email(db, email)
    if subscribed:
        if existing_subscriber is None:
            existing_subscriber = NewsletterSubscriber(email=email, is_confirmed=True)
        else:
            existing_subscriber.is_confirmed = True
        await commit_and_refresh(db, existing_subscriber)
        return _newsletter_preference_read(email=email, subscriber=existing_subscriber)
    if existing_subscriber is not None:
        await delete_and_commit(db, existing_subscriber)
    return _newsletter_preference_read(email=email, subscriber=None)


async def _request_unsubscribe(
    db: AsyncSessionDep,
    *,
    email: str,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Send an unsubscribe email when the subscriber exists, otherwise return the safe message."""
    existing_subscriber = await _get_subscriber_by_email(db, email)
    if existing_subscriber is None:
        return _safe_unsubscribe_message()

    token = create_jwt_token(email, JWTType.NEWSLETTER_UNSUBSCRIBE)
    await send_newsletter_unsubscription_request_email(email, token, background_tasks=background_tasks)
    return _safe_unsubscribe_message()


async def _load_newsletter_preference(
    db: AsyncSessionDep,
    *,
    email: str,
) -> NewsletterPreferenceRead:
    """Load the preference state for one email address."""
    existing_subscriber = await _get_subscriber_by_email(db, email)
    return _newsletter_preference_read(email=email, subscriber=existing_subscriber)


def _subscribers_statement() -> Select[tuple[NewsletterSubscriber]]:
    """Build the admin subscriber listing query."""
    return select(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc())


async def _page_subscribers(db: AsyncSessionDep) -> Page[NewsletterSubscriber]:
    """Page newsletter subscribers for the admin view."""
    return await paginate_select(db, _subscribers_statement(), model=NewsletterSubscriber)


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
    return await _create_or_resend_subscriber(db, email=email, background_tasks=background_tasks)


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
    return await _confirm_subscriber(db, token=token)


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
    return await _request_unsubscribe(db, email=email, background_tasks=background_tasks)


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
    await _unsubscribe_subscriber(db, token=token)


### Private router for user-specific newsletter preferences ##
private_router = APIRouter(prefix="/newsletter", dependencies=[Security(current_active_user)])


@private_router.get("/me", response_model=NewsletterPreferenceRead)
async def get_newsletter_preference(
    current_user: CurrentActiveUserDep, db: AsyncSessionDep
) -> NewsletterPreferenceRead:
    """Return the logged-in user's newsletter preference."""
    return await _load_newsletter_preference(db, email=current_user.email)


@private_router.put("/me", response_model=NewsletterPreferenceRead)
async def update_newsletter_preference(
    preference: NewsletterPreferenceUpdate,
    current_user: CurrentActiveUserDep,
    db: AsyncSessionDep,
) -> NewsletterPreferenceRead:
    """Update the logged-in user's newsletter preference without email verification."""
    return await _set_newsletter_preference(db, email=current_user.email, subscribed=preference.subscribed)


### Admin router ###
admin_router = APIRouter(prefix="/admin/newsletter", dependencies=[Security(current_active_superuser)])


@admin_router.get("/subscribers", response_model=Page[NewsletterSubscriberRead])
async def get_subscribers(db: AsyncSessionDep) -> Page[NewsletterSubscriber]:
    """Get all newsletter subscribers. Only accessible by superusers."""
    return await _page_subscribers(db)


### Router registration ###
router = APIRouter()

router.include_router(backend_router)
router.include_router(private_router)
router.include_router(admin_router)
