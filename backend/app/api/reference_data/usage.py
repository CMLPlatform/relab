"""Registry of the research-data columns that block deleting a reference row.

Deleting a material or product type is refused while research data still points at it.
The referencing columns live in `data_collection`, so reference_data used to import them
and depend on the context that depends on it. The owning context registers them instead,
at model-import time (bottom of its models module), the same way media parents register
with `file_storage.parents` — which keeps the dependency pointing one way.

`app.core.model_registry.load_models` guarantees those modules are imported.
"""

from dataclasses import dataclass

from sqlalchemy.orm.attributes import InstrumentedAttribute

from app.api.common.models.base import Base
from app.core.model_registry import load_models


@dataclass(frozen=True)
class UsageGuard:
    """A referencing column, and the human name of the relation it belongs to."""

    column: InstrumentedAttribute[int] | InstrumentedAttribute[int | None]
    label: str


_USAGE_GUARDS: dict[type[Base], UsageGuard] = {}


def register_reference_usage(
    model: type[Base],
    column: InstrumentedAttribute[int] | InstrumentedAttribute[int | None],
    label: str,
) -> None:
    """Record that rows of ``model`` are referenced by ``column``, blocking deletion."""
    _USAGE_GUARDS[model] = UsageGuard(column=column, label=label)


def usage_guard_for(model: type[Base]) -> UsageGuard | None:
    """Return the guard for a reference model, or None when nothing references it.

    ``load_models()`` is cached and idempotent; calling it here means a lookup can never
    see a half-populated registry, which would read as "nothing references this" and turn
    a refused deletion into a raw IntegrityError.
    """
    load_models()
    return _USAGE_GUARDS.get(model)
