"""Database models related to newsletter subscribers."""

import uuid

from pydantic import UUID4, EmailStr
from sqlmodel import Field

from app.api.common.models.base import CustomBase, TimeStampMixinBare


class NewsletterSubscriberBase(CustomBase):
    """Base schema for newsletter subscribers."""

    email: EmailStr = Field(index=True, unique=True)


class NewsletterSubscriber(NewsletterSubscriberBase, TimeStampMixinBare, table=True):
    """Database model for newsletter subscribers."""

    # HACK: Redefine id to allow None in the backend which is required by the > 2.12 pydantic/sqlmodel combo
    id: UUID4 | None = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    is_confirmed: bool = Field(default=False)
