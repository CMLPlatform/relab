"""Base model and generic mixins for SQLModel models."""

import re
from dataclasses import dataclass
from datetime import datetime  # noqa: TC003 # Used in runtime for ORM mapping, not just for type annotations
from enum import Enum
from functools import cached_property
from typing import Any, ClassVar, Self, cast

from pydantic import UUID4, ConfigDict, model_validator
from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, SQLModel


### Base Model ###
@dataclass
class APIModelName:
    """Holds derived names for a model — used in API routes and documentation."""

    name_camel: str  # The base name is expected to be in CamelCase

    @cached_property
    def plural_camel(self) -> str:
        """Get the plural form of the model name.

        Example: "Taxonomy" -> "Taxonomies"
        """
        return self.pluralize(self.name_camel)

    @cached_property
    def name_capital(self) -> str:
        """Get the model name in Capital Case for display in documentation and error messages."""
        return self.camel_to_capital(self.name_camel)

    @cached_property
    def plural_capital(self) -> str:
        """Get the plural model name in Capital Case for display in documentation and error messages."""
        return self.camel_to_capital(self.plural_camel)

    @cached_property
    def name_slug(self) -> str:
        """Get the model name in slug-case for use in URL paths."""
        return self.camel_to_slug(self.name_camel)

    @cached_property
    def plural_slug(self) -> str:
        """Get the plural model name in slug-case for use in URL paths."""
        return self.camel_to_slug(self.plural_camel)

    @cached_property
    def name_snake(self) -> str:
        """Get the model name in snake_case for use in variable names and database table names."""
        return self.camel_to_snake(self.name_camel)

    @cached_property
    def plural_snake(self) -> str:
        """Get the plural model name in snake_case for use in variable names and database table names."""
        return self.camel_to_snake(self.plural_camel)

    @staticmethod
    def pluralize(name: str) -> str:
        """Convert a word to its plural form."""
        if name.endswith("y"):
            return name[:-1] + "ies"
        if name.endswith("s"):
            return name + "es"
        return name + "s"

    @staticmethod
    def camel_to_capital(name: str) -> str:
        """Convert CamelCase to Capital Case."""
        return re.sub(r"(?<!^)(?=[A-Z])", " ", name).title()

    @staticmethod
    def camel_to_slug(name: str) -> str:
        """Convert CamelCase to slug-case."""
        return re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()

    @staticmethod
    def camel_to_snake(name: str) -> str:
        """Convert CamelCase to snake_case."""
        return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


class CustomBaseBare:
    """Bare base class for all models.

    Can be used to mixin custom base properties for classes which already have SQLModel as base class.
    """

    api_model_name: ClassVar[APIModelName | None] = None  # The name of the model used in API routes

    @classmethod
    def get_api_model_name(cls) -> APIModelName:
        """Initialize api_model_name for the class."""
        if cls.api_model_name is None:
            cls.api_model_name = APIModelName(name_camel=cls.__name__)
        return cls.api_model_name


# TODO: Base class should not inherit from SQLModel but from Pydantic's BaseModel
class CustomBase(CustomBaseBare, SQLModel):
    """Base class for all models."""


class CustomLinkingModelBase(CustomBase):
    """Base class for linking models."""


class UUIDPrimaryKeyMixin:
    """Mixin for models with a UUID primary key.

    Provides a type-safe ``db_id`` property that returns the UUID without ``None``,
    for use at call sites where the model is guaranteed to have been persisted to the DB.
    The underlying ``id`` field remains ``UUID4 | None`` to satisfy SQLModel/pydantic
    compatibility requirements (see https://github.com/fastapi/sqlmodel/issues/1623).
    """

    id: UUID4 | None  # Annotation only — actual SQLModel Field defined in the concrete model

    @property
    def db_id(self) -> UUID4:
        """Return the non-None UUID primary key for a persisted model instance.

        Raises:
            ValueError: If ``id`` is ``None``, i.e. the model has not been committed to the DB.
        """
        if self.id is None:
            msg = f"{type(self).__name__} has no ID — the instance may not have been committed to the DB yet."
            raise ValueError(msg)
        return self.id


class IntPrimaryKeyMixin:
    """Mixin for models with an integer primary key.

    Provides a type-safe ``db_id`` property that returns the integer without ``None``,
    for use at call sites where the model is guaranteed to have been persisted to the DB.
    """

    id: int | None  # Annotation only — actual SQLModel Field defined in the concrete model

    @property
    def db_id(self) -> int:
        """Return the non-None integer primary key for a persisted model instance.

        Raises:
            ValueError: If ``id`` is ``None``, i.e. the model has not been committed to the DB.
        """
        if self.id is None:
            msg = f"{type(self).__name__} has no ID — the instance may not have been committed to the DB yet."
            raise ValueError(msg)
        return self.id


### Mixins ###
## Timestamps ##
# TODO: Improve typing. Mixins should not inherit from SQLModel.
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

    TODO: Replace with proper polymorphic associations once the upstream SQLModel issue is
    resolved: https://github.com/fastapi/sqlmodel/pull/1226
    """

    parent_type: ParentTypeEnum  # type: ignore[valid-type]  # SQLModel field; concrete type set by subclass

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

    def set_parent(self, parent_type: ParentTypeEnum, parent_id: int) -> None:  # type: ignore[valid-type]
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
