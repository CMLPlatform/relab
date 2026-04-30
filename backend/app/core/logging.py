"""Main stdlib logging setup."""

from __future__ import annotations

import logging
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import TYPE_CHECKING, ClassVar

from pythonjsonlogger.json import JsonFormatter

from app.core.config import Environment, settings

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

### Logging formats
LOG_FORMAT = "%(asctime)s | %(levelname)-8s | req=%(request_id)s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"
LOG_DIR = settings.log_path

BASE_LOG_LEVEL = "DEBUG" if settings.debug else "INFO"

_EXTRA_DEFAULTS = {
    "request_id": "-",
    "http_method": None,
    "http_path": None,
    "http_status_code": None,
    "http_latency_ms": None,
}

_LOG_CONTEXT: ContextVar[dict[str, object] | None] = ContextVar("log_context", default=None)


def sanitize_log_value(value: object) -> str:
    """Normalize a value before logging it."""
    return str(value).replace("\r", " ").replace("\n", " ")


def _current_log_context() -> dict[str, object]:
    return {**_EXTRA_DEFAULTS, **(_LOG_CONTEXT.get() or {})}


def _add_request_context(record: logging.LogRecord) -> None:
    for key, value in _current_log_context().items():
        if not hasattr(record, key):
            setattr(record, key, value)


@contextmanager
def log_context(**values: object) -> Iterator[None]:
    """Temporarily add request-scoped values to stdlib log records."""
    context = {**(_LOG_CONTEXT.get() or {}), **values}
    token = _LOG_CONTEXT.set(context)
    try:
        yield
    finally:
        _LOG_CONTEXT.reset(token)


class RequestContextFilter(logging.Filter):
    """Attach default request context to records created outside the app factory."""

    def filter(self, record: logging.LogRecord) -> bool:
        """Attach context and keep every record."""
        _add_request_context(record)
        return True


class UTCFormatter(logging.Formatter):
    """Human-readable logging formatter using UTC timestamps."""

    converter: ClassVar = staticmethod(time.gmtime)


def build_json_formatter() -> JsonFormatter:
    """Build the production JSON formatter from python-json-logger."""
    return JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(funcName)s %(lineno)d %(message)s "
        "%(request_id)s %(http_method)s %(http_path)s %(http_status_code)s %(http_latency_ms)s",
        rename_fields={
            "asctime": "time",
            "levelname": "level",
            "funcName": "function",
        },
        json_ensure_ascii=False,
    )


def configure_logging_handlers(base_log_level: str) -> list[logging.Handler]:
    """Build stdlib logging handlers for the current environment."""
    use_json_logs = settings.environment in (Environment.PROD, Environment.STAGING)
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(logging.getLevelNamesMapping().get(base_log_level, logging.INFO))
    handler.addFilter(RequestContextFilter())
    if use_json_logs:
        handler.setFormatter(build_json_formatter())
    else:
        handler.setFormatter(UTCFormatter(LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S"))
    return [handler]


def setup_logging(
    log_dir: Path | None = LOG_DIR,
    base_log_level: str = BASE_LOG_LEVEL,
    *,
    stdout_only: bool = True,
) -> None:
    """Setup stdlib logging for application and framework logs."""
    del log_dir, stdout_only

    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
        handler.close()

    logging.root.setLevel(logging.NOTSET)
    for handler in configure_logging_handlers(base_log_level):
        logging.root.addHandler(handler)

    # Ensure uvicorn and other noisy loggers propagate correctly so that logs are not duplicated.
    watchfiles_logger = "watchfiles.main"

    noisy_loggers = [
        watchfiles_logger,
        "faker",
        "faker.factory",
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "watchfiles.main",
        "sqlalchemy",
        "sqlalchemy.engine",
        "sqlalchemy.engine.Engine",
        "sqlalchemy.pool",
        "sqlalchemy.dialects",
        "sqlalchemy.orm",
        "fastapi",
        "asyncio",
        "starlette",
    ]
    for logger_name in noisy_loggers:
        logging_logger = logging.getLogger(logger_name)
        logging_logger.handlers = []  # Clear existing handlers
        logging_logger.propagate = True  # Propagate to the root application handler

        # Keep known-noisy library loggers from spamming test and app output.
        if logger_name in {watchfiles_logger, "faker", "faker.factory"}:
            logging_logger.setLevel(logging.WARNING)


async def cleanup_logging() -> None:
    """Flush application logging handlers on shutdown."""
    for handler in logging.root.handlers[:]:
        handler.flush()
