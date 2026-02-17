"""Common typing utilities for the application."""

from enum import Enum
from typing import TypeVar
from uuid import UUID

from fastapi_filter.contrib.sqlalchemy import Filter

from app.api.common.models.base import CustomBaseBare, CustomLinkingModelBase

### Type aliases ###
# Type alias for ID types
IDT = TypeVar("IDT", bound=int | UUID)

### TypeVars ###
# TypeVar for models
MT = TypeVar("MT", bound=CustomBaseBare)

# Typevar for dependent models
DT = TypeVar("DT", bound=CustomBaseBare)

# Typevar for linking models
LMT = TypeVar("LMT", bound=CustomLinkingModelBase)

# Typevar for Enum classes
ET = TypeVar("ET", bound=Enum)

# Typevar for Filter classes
FT = TypeVar("FT", bound=Filter)
