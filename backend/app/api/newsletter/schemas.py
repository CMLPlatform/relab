"""DTO schemas for newsletter subscribers."""

from pydantic import Field

from app.api.common.schemas.base import BaseCreateSchema, BaseReadSchemaWithTimeStamp
from app.api.newsletter.models import NewsletterSubscriberBase


class NewsletterSubscriberCreate(BaseCreateSchema, NewsletterSubscriberBase):
    """Create schema for newsletter subscribers."""


class NewsletterSubscriberRead(BaseReadSchemaWithTimeStamp, NewsletterSubscriberBase):
    """Read schema for newsletter subscribers."""

    is_confirmed: bool = Field()
