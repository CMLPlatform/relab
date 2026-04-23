"""Database models related to newsletter subscribers."""

import uuid

from pydantic import BaseModel, EmailStr
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.api.common.models.base import Base, TimeStampMixinBare


### Pydantic base schema (shared with schemas.py) ###
class NewsletterSubscriberBase(BaseModel):
    """Base schema for newsletter subscribers. Used by Pydantic schemas only, not ORM."""

    email: EmailStr


class NewsletterSubscriber(TimeStampMixinBare, Base):
    """Database model for newsletter subscribers."""

    __tablename__ = "newslettersubscriber"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, index=True, unique=True)
    is_confirmed: Mapped[bool] = mapped_column(default=False)
