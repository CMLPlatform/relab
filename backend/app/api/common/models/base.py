"""Base model helpers and generic mixins for ORM models."""

import re
from datetime import datetime  # noqa: TC003 # Used in runtime for ORM mapping, not just for type annotations
from typing import TYPE_CHECKING

import inflect
from sqlalchemy import DateTime, func
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

if TYPE_CHECKING:
    from typing import Any


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 declarative base for all ORM models."""

    def model_dump(self, *, exclude: set[str] | None = None, exclude_unset: bool = False) -> dict[str, Any]:
        """Serialize ORM instance to a dict."""
        exclude = exclude or set()
        if exclude_unset:
            unmodified = sa_inspect(self).unmodified
            return {
                c.key: getattr(self, c.key)
                for c in self.__table__.columns
                if c.key not in exclude and c.key not in unmodified
            }
        return {c.key: getattr(self, c.key) for c in self.__table__.columns if c.key not in exclude}


_INFLECT_ENGINE = inflect.engine()


def pluralize_camel_name(name: str) -> str:
    """Pluralize the final word in a CamelCase name."""
    parts = re.split(r"(?<!^)(?=[A-Z])", name)
    singular = parts[-1]
    plural = _INFLECT_ENGINE.plural_noun(singular.lower()) or _INFLECT_ENGINE.plural(singular.lower())
    parts[-1] = plural.capitalize() if singular[:1].isupper() else plural
    return "".join(parts)


def camel_to_capital(name: str) -> str:
    """Convert CamelCase to Capital Case."""
    return re.sub(r"(?<!^)(?=[A-Z])", " ", name).title()


def get_model_label(model_type: type[object] | None, *, default: str = "Model") -> str:
    """Return a human-readable singular label for a model-like class."""
    if model_type is None:
        return default

    explicit_label = getattr(model_type, "model_label", None)
    if isinstance(explicit_label, str):
        return explicit_label

    return camel_to_capital(getattr(model_type, "__name__", default))


def get_model_label_plural(model_type: type[object], *, default: str = "Models") -> str:
    """Return a human-readable plural label for a model-like class."""
    explicit_label_plural = getattr(model_type, "model_label_plural", None)
    if isinstance(explicit_label_plural, str):
        return explicit_label_plural

    model_name = getattr(model_type, "__name__", default.removesuffix("s"))
    return camel_to_capital(pluralize_camel_name(model_name))


### Mixins ###
## Timestamps ##
class TimeStampMixinBare:
    """Mixin that adds created_at and updated_at columns with server-side defaults."""

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=None
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        default=None,  # spell-checker: ignore onupdate
    )


## Metadata JSON field ##
class MetadataMixin:
    """Mixin to add JSONB metadata field to models.

    Note: Validation of the metadata content should be done in the DTO schemas.
    """

    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
