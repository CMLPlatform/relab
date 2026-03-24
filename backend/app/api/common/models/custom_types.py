"""Common typing utilities for the application."""

from enum import Enum
from typing import Protocol, TypeVar
from uuid import UUID

from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.common.models.base import CustomBaseBare, CustomLinkingModelBase


### Protocols ###
class HasDBID(Protocol):
    """Protocol for models with a non-None db_id field."""

    @property
    def db_id(self) -> int | UUID: ...  # noqa: D102


### TypeVars ###
# ID type — constrains parameters that accept either integer or UUID primary keys
IDT = TypeVar("IDT", bound=int | UUID)

# Any model (id may be None — not yet persisted)
MT = TypeVar("MT", bound=CustomBaseBare)

# Model returned from a DB query (id guaranteed non-None at runtime)
FetchedModelT = TypeVar("FetchedModelT", bound=HasDBID)

# Dependent model in a nested relationship
DT = TypeVar("DT", bound=CustomBaseBare)

# Linking / association model
LMT = TypeVar("LMT", bound=CustomLinkingModelBase)

# Enum subclass
ET = TypeVar("ET", bound=Enum)

# FastAPI-Filter subclass — reserved for future use in generic filter helpers
FT = TypeVar("FT", bound=Filter)
