"""DTO schemas for newsletter subscribers."""

from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp, BaseUpdateSchema
from app.api.newsletter.models import NewsletterSubscriberBase


class NewsletterSubscriberCreate(BaseCreateSchema, NewsletterSubscriberBase):
    """Create schema for newsletter subscribers."""

    email: Annotated[EmailStr, StringConstraints(strip_whitespace=True)] = Field()


class NewsletterSubscriberRead(BaseReadSchemaWithTimeStamp, NewsletterSubscriberBase):
    """Read schema for newsletter subscribers."""

    is_confirmed: bool = Field()


class NewsletterPreferenceRead(BaseModel):
    """Read schema for a logged-in user's newsletter preference."""

    email: EmailStr = Field()
    subscribed: bool = Field()
    is_confirmed: bool = Field()


class NewsletterPreferenceUpdate(BaseUpdateSchema):
    """Update schema for a logged-in user's newsletter preference."""

    subscribed: bool = Field()
