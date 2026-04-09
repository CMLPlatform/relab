"""Main logger setup."""

import logging
import sys
from dataclasses import dataclass
from typing import TYPE_CHECKING

import loguru

from app.core.config import Environment, settings

if TYPE_CHECKING:
    from pathlib import Path

### Logging formats
LOG_FORMAT = (
    "<green>{time:YYYY-MM-DD HH:mm:ss!UTC}</green> | "
    "<level>{level: <8}</level> | "
    "req=<magenta>{extra[request_id]}</magenta> | "
    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
    "<level>{message}</level>"
)
LOG_DIR = settings.log_path

BASE_LOG_LEVEL = "DEBUG" if settings.debug else "INFO"


@dataclass
class OriginalLogInfo:
    """Original log info used when intercepting standard logging."""

    original_name: str
    original_func: str
    original_line: int


def sanitize_log_value(value: object) -> str:
    """Normalize a value before logging it."""
    return str(value).replace("\r", " ").replace("\n", " ")


class InterceptHandler(logging.Handler):
    """Intercept standard logging messages and route them to loguru."""

    def emit(self, record: logging.LogRecord) -> None:
        """Override emit to route standard logging to loguru."""
        try:
            level = loguru.logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = logging.currentframe(), 0
        while frame and (
            depth < 2
            or frame.f_code.co_filename == logging.__file__
            or frame.f_code.co_filename.endswith("logging/__init__.py")
        ):
            frame = frame.f_back
            depth += 1

        # Preserve the original log record info
        loguru.logger.bind(
            original_info=OriginalLogInfo(
                original_name=record.name,
                original_func=record.funcName,
                original_line=record.lineno,
            )
        ).opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def patch_log_record(record: loguru.Record) -> None:
    """Patch loguru record to use the original standard logger name/function/line if intercepted."""
    record["extra"].setdefault("request_id", "-")
    record["extra"].setdefault("http_method", None)
    record["extra"].setdefault("http_path", None)
    record["extra"].setdefault("http_status_code", None)
    record["extra"].setdefault("http_latency_ms", None)

    if original_info := record["extra"].get("original_info"):
        record["name"] = original_info.original_name
        record["function"] = original_info.original_func
        record["line"] = original_info.original_line


def configure_loguru_handlers(log_dir: Path | None, base_log_level: str) -> None:
    """Setup loguru sinks."""
    is_enqueued = settings.environment in (Environment.PROD, Environment.STAGING)
    use_json_logs = settings.environment in (Environment.PROD, Environment.STAGING)

    # Console handler
    loguru.logger.add(
        sys.stderr,
        level=base_log_level,
        format=LOG_FORMAT,
        colorize=not use_json_logs,
        backtrace=True,
        diagnose=True,
        enqueue=is_enqueued,
        serialize=use_json_logs,
    )
    del log_dir


def setup_logging(
    log_dir: Path | None = LOG_DIR,
    base_log_level: str = BASE_LOG_LEVEL,
    *,
    stdout_only: bool = True,
) -> None:
    """Setup loguru logging configuration and intercept standard logging."""
    if stdout_only:
        log_dir = None

    # Remove standard loguru stdout handler to avoid duplicates
    loguru.logger.remove()

    loguru.logger.configure(patcher=patch_log_record)
    configure_loguru_handlers(log_dir, base_log_level)

    # Clear any existing root handlers
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)

    # Intercept everything at the root logger
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Ensure uvicorn and other noisy loggers propagate correctly so that they are not duplicated in the logs
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
        logging_logger.propagate = True  # Propagate to InterceptHandler at the root

        # Keep known-noisy library loggers from spamming test and app output.
        if logger_name in {watchfiles_logger, "faker", "faker.factory"}:
            logging_logger.setLevel(logging.WARNING)


async def cleanup_logging() -> None:
    """Cleanup loguru queues on shutdown."""
    loguru.logger.remove()
    await loguru.logger.complete()
