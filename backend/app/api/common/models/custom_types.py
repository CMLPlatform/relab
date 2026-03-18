"""Common typing utilities for the application."""

from enum import Enum
from typing import Protocol, TypeVar, runtime_checkable
from uuid import UUID

from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.common.models.base import CustomBaseBare, CustomLinkingModelBase


### Protocols for Type Safety ###
@runtime_checkable
class HasID(Protocol):
    """Protocol for models that have an ID field.

    Models returned from database queries are guaranteed to have an ID,
    which distinguishes them from models before commit (where id may be None).
    """

    @property
    def id(self) -> int | UUID:
        """Model ID, guaranteed to exist for persisted models."""
        ...


@runtime_checkable
class HasIntID(Protocol):
    """Protocol for models with integer IDs."""

    @property
    def id(self) -> int:
        """Integer model ID."""
        ...


@runtime_checkable
class HasUUID(Protocol):
    """Protocol for models with UUID IDs."""

    @property
    def id(self) -> UUID:
        """UUID model ID."""
        ...


### Type aliases ###
# Type alias for ID types
IDT = TypeVar("IDT", bound=int | UUID)

### TypeVars ###
# TypeVar for any model (may not have ID set yet)
MT = TypeVar("MT", bound=CustomBaseBare)

# TypeVar for fetched models (ID guaranteed to exist)
FetchedModelT = TypeVar("FetchedModelT", bound=HasID)

# TypeVar for models with int IDs
IntIDModelT = TypeVar("IntIDModelT", bound=HasIntID)

# TypeVar for models with UUID IDs
UUIDModelT = TypeVar("UUIDModelT", bound=HasUUID)

# Typevar for dependent models
DT = TypeVar("DT", bound=CustomBaseBare)

# Typevar for linking models
LMT = TypeVar("LMT", bound=CustomLinkingModelBase)

# Typevar for Enum classes
ET = TypeVar("ET", bound=Enum)

# Typevar for Filter classes
FT = TypeVar("FT", bound=Filter)
