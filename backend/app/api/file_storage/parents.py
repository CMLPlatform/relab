"""Registry of ORM models that can own media rows.

Media rows carry ``(parent_type, parent_id)`` with no FK, so file_storage needs
the owning model to resolve or validate a parent. Owning contexts register
themselves at model-import time (bottom of their models module) rather than
file_storage importing them — that keeps the dependency pointing one way.
``app.core.model_registry.load_models`` guarantees those modules are imported.
"""

from types import MappingProxyType

from app.api.common.exceptions import BadRequestError
from app.api.common.models.base import Base
from app.api.file_storage.models import MediaParentType

_PARENT_MODELS: dict[MediaParentType, type[Base]] = {}


def register_media_parent(parent_type: MediaParentType, model: type[Base]) -> None:
    """Register the ORM model that owns media rows of ``parent_type``."""
    _PARENT_MODELS[parent_type] = model


def registered_media_parents() -> MappingProxyType[MediaParentType, type[Base]]:
    """Return every registered parent type and its ORM model."""
    return MappingProxyType(_PARENT_MODELS)


def parent_model_for_type(parent_type: MediaParentType) -> type[Base]:
    """Return the ORM model for a storage parent type."""
    try:
        return _PARENT_MODELS[parent_type]
    except KeyError:
        msg = f"Invalid parent type: {parent_type}"
        raise BadRequestError(msg) from None
