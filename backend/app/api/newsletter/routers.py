"""Basic newsletter subscription endpoint."""

from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Security
from fastapi.params import Body
from pydantic import EmailStr
from sqlmodel import select

from app.api.auth.dependencies import current_active_superuser
from app.api.common.routers.dependencies import AsyncSessionDep
from app.api.newsletter.models import NewsletterSubscriber
from app.api.newsletter.schemas import NewsletterSubscriberRead
from app.api.newsletter.utils.emails import (
    send_newsletter_subscription_email,
    send_newsletter_unsubscription_request_email,
)
from app.api.newsletter.utils.tokens import JWTType, create_jwt_token, verify_jwt_token

### Main backend router ###
backend_router = APIRouter(prefix="/newsletter")


@backend_router.post("/subscribe", status_code=201, response_model=NewsletterSubscriberRead)
async def subscribe_to_newsletter(
    email: Annotated[EmailStr, Body()], db: AsyncSessionDep, background_tasks: BackgroundTasks
) -> NewsletterSubscriber:
    """Subscribe to the newsletter to receive updates about the app launch."""
    # Check if the email already exists
    existing_subscriber = (
        (await db.exec(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).unique().one_or_none()
    )

    if existing_subscriber:
        if existing_subscriber.is_confirmed:
            raise HTTPException(status_code=400, detail="Already subscribed.")

        # If not confirmed, generate new token and send email
        token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
        await send_newsletter_subscription_email(email, token, background_tasks=background_tasks)
        raise HTTPException(
            status_code=400,
            detail="Already subscribed, but not confirmed. A new confirmation email has been sent.",
        )

    # Create new subscriber
    new_subscriber = NewsletterSubscriber(email=email)
    db.add(new_subscriber)
    await db.commit()
    await db.refresh(new_subscriber)

    # Send confirmation email
    token = create_jwt_token(email, JWTType.NEWSLETTER_CONFIRMATION)
    await send_newsletter_subscription_email(email, token, background_tasks=background_tasks)

    return new_subscriber


@backend_router.post("/confirm", status_code=200, response_model=NewsletterSubscriberRead)
async def confirm_newsletter_subscription(token: Annotated[str, Body()], db: AsyncSessionDep) -> NewsletterSubscriber:
    """Confirm the newsletter subscription."""
    # Verify the token
    email = verify_jwt_token(token, JWTType.NEWSLETTER_CONFIRMATION)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link.")

    # Check if the email is already confirmed
    existing_subscriber = (
        (await db.exec(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).unique().one_or_none()
    )

    if not existing_subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found.")

    if existing_subscriber.is_confirmed:
        raise HTTPException(status_code=400, detail="Already confirmed.")

    # Update subscriber status to confirmed
    existing_subscriber.is_confirmed = True
    await db.commit()
    await db.refresh(existing_subscriber)

    return existing_subscriber


@backend_router.post("/request-unsubscribe", status_code=200)
async def request_unsubscribe(
    email: Annotated[EmailStr, Body()], db: AsyncSessionDep, background_tasks: BackgroundTasks
) -> dict:
    """Request to unsubscribe by sending an email with unsubscribe link."""
    # Check if the email is subscribed
    existing_subscriber = (
        (await db.exec(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).unique().one_or_none()
    )

    if not existing_subscriber:
        # Don't reveal if someone is subscribed or not for privacy reasons
        return {"message": "If you are subscribed, we've sent an unsubscribe link to your email."}

    # Generate unsubscribe token
    token = create_jwt_token(email, JWTType.NEWSLETTER_UNSUBSCRIBE)

    # Send unsubscription email with the link
    await send_newsletter_unsubscription_request_email(email, token, background_tasks=background_tasks)

    return {"message": "If you are subscribed, we've sent an unsubscribe link to your email."}


@backend_router.post("/unsubscribe", status_code=204)
async def unsubscribe_with_token(token: Annotated[str, Body()], db: AsyncSessionDep) -> None:
    """One-click unsubscribe from newsletter using a token."""
    # Verify the token
    email = verify_jwt_token(token, JWTType.NEWSLETTER_UNSUBSCRIBE)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired unsubscribe link.")

    # Check if the email is subscribed
    existing_subscriber = (
        (await db.exec(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))).unique().one_or_none()
    )

    if not existing_subscriber:
        raise HTTPException(status_code=404, detail="Subscriber not found.")

    # Remove subscriber
    await db.delete(existing_subscriber)
    await db.commit()


### Admin router ###
admin_router = APIRouter(prefix="/admin/newsletter", dependencies=[Security(current_active_superuser)])


@admin_router.get("/subscribers", response_model=Sequence[NewsletterSubscriberRead])
async def get_subscribers(db: AsyncSessionDep) -> Sequence[NewsletterSubscriber]:
    """Get all newsletter subscribers. Only accessible by superusers."""
    subscribers = await db.exec(select(NewsletterSubscriber))
    return subscribers.all()


### Router registration ###
router = APIRouter()

router.include_router(backend_router)
router.include_router(admin_router)
