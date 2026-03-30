"""Database models related to newsletter subscribers."""

import uuid

from pydantic import UUID4, EmailStr
from sqlmodel import Field, SQLModel

from app.api.common.models.base import TimeStampMixinBare


class NewsletterSubscriberBase(SQLModel):
    """Base schema for newsletter subscribers."""

    email: EmailStr = Field(index=True, unique=True)


class NewsletterSubscriber(NewsletterSubscriberBase, TimeStampMixinBare, table=True):
    """Database model for newsletter subscribers."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    is_confirmed: bool = Field(default=False)
