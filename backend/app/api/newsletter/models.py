"""Database models related to newsletter subscribers."""

import uuid
from typing import Annotated

from pydantic import UUID4, EmailStr, StringConstraints
from sqlmodel import Field

from app.api.common.models.base import CustomBase, TimeStampMixinBare


class NewsletterSubscriberBase(CustomBase):
    """Base schema for newsletter subscribers."""

    email: Annotated[EmailStr, StringConstraints(strip_whitespace=True)] = Field(index=True, unique=True)


class NewsletterSubscriber(NewsletterSubscriberBase, TimeStampMixinBare, table=True):
    """Database model for newsletter subscribers."""

    id: UUID4 = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    is_confirmed: bool = Field(default=False)
