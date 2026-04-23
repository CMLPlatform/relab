"""Common typing utilities for the application."""

from enum import Enum
from typing import TypeVar
from uuid import UUID

from app.api.common.models.base import Base

### TypeVars ###
# ID type: constrains parameters that accept either integer or UUID primary keys
IDT = TypeVar("IDT", bound=int | UUID)

# Any model (id may be None; not yet persisted)
MT = TypeVar("MT", bound=Base)

# Dependent model in a nested relationship
DT = TypeVar("DT", bound=Base)

# Linking / association model
LMT = TypeVar("LMT", bound=Base)

# Enum subclass
ET = TypeVar("ET", bound=Enum)
