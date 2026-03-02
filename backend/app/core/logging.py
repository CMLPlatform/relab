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
    if original_info := record["extra"].get("original_info"):
        record["name"] = original_info.original_name
        record["function"] = original_info.original_func
        record["line"] = original_info.original_line


def configure_loguru_handlers(log_dir: Path, base_log_level: str) -> None:
    """Setup loguru sinks."""
    is_enqueued = settings.environment in (Environment.PROD, Environment.STAGING)

    # Console handler
    loguru.logger.add(
        sys.stderr,
        level=base_log_level,
        format=LOG_FORMAT,
        colorize=True,
        backtrace=True,
        diagnose=True,
        enqueue=is_enqueued,
    )

    # Debug file sync - keep 3 days
    loguru.logger.add(
        log_dir / "debug.log",
        level="DEBUG",
        rotation="00:00",
        retention="3 days",
        format=LOG_FORMAT,
        backtrace=True,
        diagnose=True,
        enqueue=is_enqueued,
        encoding="utf-8",
    )

    # Info file sync - keep 14 days
    loguru.logger.add(
        log_dir / "info.log",
        level="INFO",
        rotation="00:00",
        retention="14 days",
        format=LOG_FORMAT,
        backtrace=True,
        diagnose=True,
        enqueue=is_enqueued,
        encoding="utf-8",
    )

    # Error file sync - keep 12 weeks
    loguru.logger.add(
        log_dir / "error.log",
        level="ERROR",
        rotation="1 week",
        retention="12 weeks",
        format=LOG_FORMAT,
        backtrace=True,
        diagnose=True,
        enqueue=is_enqueued,
        encoding="utf-8",
    )


def setup_logging(
    log_dir: Path = LOG_DIR,
    base_log_level: str = BASE_LOG_LEVEL,
) -> None:
    """Setup loguru logging configuration and intercept standard logging."""
    log_dir.mkdir(exist_ok=True)

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

        # Set watchfiles to warning to further reduce noise
        if logger_name == watchfiles_logger:
            logging_logger.setLevel(logging.WARNING)


async def cleanup_logging() -> None:
    """Cleanup loguru queues on shutdown."""
    loguru.logger.remove()
    await loguru.logger.complete()
