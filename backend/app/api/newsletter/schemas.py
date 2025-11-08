"""DTO schemas for newsletter subscribers."""

from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp
from app.api.newsletter.models import NewsletterSubscriberBase


class NewsletterSubscriberCreate(BaseCreateSchema, NewsletterSubscriberBase):
    """Create schema for newsletter subscribers."""

    email: Annotated[EmailStr, StringConstraints(strip_whitespace=True)] = Field()


class NewsletterSubscriberRead(BaseReadSchemaWithTimeStamp, NewsletterSubscriberBase):
    """Read schema for newsletter subscribers."""

    is_confirmed: bool = Field()
