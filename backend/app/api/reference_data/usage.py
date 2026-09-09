"""Registry of the research-data columns that block deleting a reference row.

Deleting a material or product type is refused while research data still points at it.
The referencing columns live in `data_collection`, so reference_data used to import them
and depend on the context that depends on it. The owning context registers them instead,
at model-import time (bottom of its models module), the same way media parents register
with `file_storage.parents`, which keeps the dependency pointing one way.

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


_USAGE_GUARDS: dict[type[Base], list[UsageGuard]] = {}


def register_reference_usage(
    model: type[Base],
    column: InstrumentedAttribute[int] | InstrumentedAttribute[int | None],
    label: str,
) -> None:
    """Record that rows of ``model`` are referenced by ``column``, blocking deletion.

    One model can be referenced from several columns, so registrations accumulate: a
    second relation must add a guard rather than replace the first and stop blocking on
    it.
    """
    _USAGE_GUARDS.setdefault(model, []).append(UsageGuard(column=column, label=label))


def usage_guards_for(model: type[Base]) -> list[UsageGuard]:
    """Return every guard registered for a reference model.

    ``load_models()`` is cached and idempotent; calling it here means a lookup can never
    see a half-populated registry, which would read as "nothing references this" and turn
    a refused deletion into a raw IntegrityError.

    Raises:
        LookupError: when nothing is registered for *model*. Every deletable reference
            model is referenced by research data behind a NO ACTION foreign key, so an
            empty registry means a missing registration, not an unreferenced model.
            Failing open there would answer a raw 500 instead of a conflict naming the
            relation that holds the row.
    """
    load_models()
    guards = _USAGE_GUARDS.get(model)
    if not guards:
        msg = (
            f"No reference-usage guard registered for {model.__name__}: the context owning the "
            f"referencing column must call register_reference_usage() from its models module."
        )
        raise LookupError(msg)
    return guards
