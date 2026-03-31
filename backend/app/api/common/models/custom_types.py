"""Common typing utilities for the application."""

from enum import Enum
from typing import TypeVar
from uuid import UUID

from sqlmodel import SQLModel

### TypeVars ###
# ID type: constrains parameters that accept either integer or UUID primary keys
IDT = TypeVar("IDT", bound=int | UUID)

# Any model (id may be None; not yet persisted)
MT = TypeVar("MT", bound=SQLModel)

# Dependent model in a nested relationship
DT = TypeVar("DT", bound=SQLModel)

# Linking / association model
LMT = TypeVar("LMT", bound=SQLModel)

# Enum subclass
ET = TypeVar("ET", bound=Enum)
