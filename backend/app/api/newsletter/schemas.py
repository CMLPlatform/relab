"""DTO schemas for newsletter subscribers."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp, BaseUpdateSchema
from app.api.newsletter.examples import (
    NEWSLETTER_PREFERENCE_READ_EXAMPLES,
    NEWSLETTER_PREFERENCE_UPDATE_EXAMPLES,
    NEWSLETTER_SUBSCRIBER_READ_EXAMPLES,
)
from app.api.newsletter.models import NewsletterSubscriberBase


class NewsletterSubscriberCreate(BaseCreateSchema, NewsletterSubscriberBase):
    """Create schema for newsletter subscribers."""

    email: Annotated[EmailStr, StringConstraints(strip_whitespace=True)] = Field()


class NewsletterSubscriberRead(BaseReadSchemaWithTimeStamp, NewsletterSubscriberBase):
    """Read schema for newsletter subscribers."""

    model_config = ConfigDict(json_schema_extra={"examples": NEWSLETTER_SUBSCRIBER_READ_EXAMPLES})

    is_confirmed: bool = Field()


class NewsletterPreferenceRead(BaseModel):
    """Read schema for a logged-in user's newsletter preference."""

    model_config = ConfigDict(json_schema_extra={"examples": NEWSLETTER_PREFERENCE_READ_EXAMPLES})

    email: EmailStr = Field()
    subscribed: bool = Field()
    is_confirmed: bool = Field()


class NewsletterPreferenceUpdate(BaseUpdateSchema):
    """Update schema for a logged-in user's newsletter preference."""

    model_config = ConfigDict(json_schema_extra={"examples": NEWSLETTER_PREFERENCE_UPDATE_EXAMPLES})

    subscribed: bool = Field()
