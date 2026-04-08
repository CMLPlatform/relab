"""Base model helpers and generic mixins for ORM models."""

import re
from datetime import datetime  # noqa: TC003 # Used in runtime for ORM mapping, not just for type annotations
from enum import Enum
from typing import Any, Self, cast

import inflect
from pydantic import ConfigDict, model_validator
from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase
from sqlmodel import Column, Field, SQLModel


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 declarative base for all ORM models.

    Uses SQLModel.metadata as a bridge so that rpi_cam plugin models
    (still on SQLModel) share the same registry. Remove this bridge
    when rpi_cam is migrated.
    """

    metadata = SQLModel.metadata  # type: ignore[assignment]


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
    """Bare mixin to add created_at and updated_at columns to Pydantic BaseModel-based classes.

    Can be used to mixin timestamp properties for classes which already have BaseModel as base class.
    """

    created_at: datetime | None = Field(
        default=None,
        sa_type=cast("Any", DateTime(timezone=True)),
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime | None = Field(
        default=None,
        sa_type=cast("Any", DateTime(timezone=True)),
        sa_column_kwargs={"server_default": func.now(), "onupdate": func.now()},  # spell-checker: ignore onupdate
    )


## Quasi-Polymorphic Associations ##
class SingleParentMixin[ParentTypeEnum: Enum](SQLModel):
    """Mixin to ensure an object belongs to exactly one parent.

    ``ParentTypeEnum`` must be a ``StrEnum`` whose values are the snake_case names of the
    parent model tables (e.g. ``"product"``, ``"material"``).  The mixin derives the
    corresponding foreign-key field names automatically (e.g. ``product_id``).
    """

    # TODO: Replace with proper polymorphic associations once the upstream SQLModel issue is
    # resolved: https://github.com/fastapi/sqlmodel/pull/1226

    parent_type: ParentTypeEnum

    model_config: ConfigDict = ConfigDict(arbitrary_types_allowed=True)

    @classmethod
    def get_parent_type_description(cls, enum_class: type[Enum]) -> str:
        """Generate description string for parent_type field using actual enum class."""
        return f"Type of the parent object, e.g. {', '.join(t.value for t in enum_class)}"

    @property
    def possible_parent_fields(self) -> list[str]:
        """Get all possible parent ID field names."""
        enum_class = type(self.parent_type)
        return [f"{t.value!s}_id" for t in enum_class]

    @property
    def set_parent_fields(self) -> list[str]:
        """Get currently set parent ID field names."""
        return [field for field in self.possible_parent_fields if getattr(self, field, None) is not None]

    @model_validator(mode="after")
    def validate_single_parent(self) -> Self:
        """Ensure parent_type and ID are consistent."""
        if len(self.set_parent_fields) != 1:
            err_msg = f"Exactly one parent ID must be set, found {self.set_parent_fields}"
            raise ValueError(err_msg)

        expected_field = f"{self.parent_type!s}_id"
        if expected_field not in self.set_parent_fields:
            err_msg = f"Parent type {self.parent_type} doesn't match set parent ID"
            raise ValueError(err_msg)

        return self

    @property
    def parent_id(self) -> int:
        """Get the ID of the current parent object."""
        field = f"{self.parent_type.value!s}_id"
        return getattr(self, field)

    def set_parent(self, parent_type: ParentTypeEnum, parent_id: int) -> None:
        """Set the parent type and ID."""
        self.parent_type = parent_type

        # Clear existing parents
        for field in self.set_parent_fields:
            setattr(self, field, None)

        # Set new parent ID
        field = f"{parent_type.value}_id"
        if field not in self.possible_parent_fields:
            err_msg = f"Parent field '{field}' not found. Available fields: {self.possible_parent_fields}"
            raise AttributeError(err_msg)

        setattr(self, field, parent_id)


## Metadata JSON field ##
class MetadataMixin:
    """Mixin to add JSONB metadata field to models.

    Note: Validation of the metadata content should be done in the DTO schemas.
    """

    metadata_json: dict[str, Any] | None = Field(
        default=None, alias="metadata", description="Object metadata as a JSON dict", sa_column=Column(JSONB)
    )
