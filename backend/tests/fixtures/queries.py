"""SQL statement counting for query-scaling tests."""

from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from sqlalchemy import event
from sqlalchemy.engine import Engine

if TYPE_CHECKING:
    from collections.abc import Iterator


@contextmanager
def count_queries() -> Iterator[list[str]]:
    """Collect the SQL of every statement any engine runs inside the block.

    Assert on ``len()`` at two input sizes (say n and 10n): an equal count shows the
    path does not issue a query per row.
    """
    statements: list[str] = []

    def record(_conn: Any, _cursor: Any, statement: str, *_args: Any) -> None:
        statements.append(statement)

    event.listen(Engine, "before_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(Engine, "before_cursor_execute", record)
