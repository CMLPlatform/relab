"""Main logger setup."""

import logging
import sys
import time
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

import coloredlogs

from app.core.config import settings

### Logging formats

LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
LOG_DIR = settings.log_path

LOG_CONFIG = {
    # (level, rotation interval, backup count)
    "debug": (logging.DEBUG, "midnight", 3),  # All logs, 3 days
    "info": (logging.INFO, "midnight", 14),  # INFO and above, 14 days
    "error": (logging.ERROR, "W0", 12),  # ERROR and above, 12 weeks
}

BASE_LOG_LEVEL = logging.DEBUG if settings.debug else logging.INFO


### Logging utils ###
# TODO: Move from coloredlogs to loguru for simpler logging configuration
def set_utc_logging() -> None:
    """Configure logging to use UTC timestamps."""
    logging.Formatter.converter = time.gmtime


def create_file_handlers(log_dir: Path, fmt: str, datefmt: str) -> dict[str, logging.Handler]:
    """Create file handlers for each log level."""
    handler_dict: dict[str, logging.Handler] = {}
    for name, (level, interval, count) in LOG_CONFIG.items():
        handler = TimedRotatingFileHandler(
            filename=log_dir / f"{name}.log",
            when=interval,
            backupCount=count,
            encoding="utf-8",
            utc=True,
        )
        handler.setFormatter(logging.Formatter(fmt=fmt, datefmt=datefmt))
        handler.setLevel(level)
        handler_dict[name] = handler
    return handler_dict


def is_console_handler(handler: logging.Handler) -> bool:
    """Check if handler outputs to console."""
    return isinstance(handler, logging.StreamHandler | coloredlogs.StandardErrorHandler) and handler.stream in (
        sys.stdout,
        sys.stderr,
        None,
    )


### Logging setup ###
def setup_logging(
    *,
    fmt: str = LOG_FORMAT,
    datefmt: str = DATE_FORMAT,
    log_dir: Path = LOG_DIR,
    base_log_level: int = BASE_LOG_LEVEL,
) -> None:
    """Setup logging configuration with consistent handlers."""
    # Set UTC timezone for all logging
    set_utc_logging()

    # Create log directory if it doesn't exist
    log_dir.mkdir(exist_ok=True)

    # Configure root logger
    root_logger: logging.Logger = logging.getLogger()

    # Install colored console logging
    coloredlogs.install(level=base_log_level, fmt=fmt, datefmt=datefmt)

    # Add file handlers to root logger
    file_handlers: dict[str, logging.Handler] = create_file_handlers(log_dir, fmt, datefmt)
    for handler in file_handlers.values():
        root_logger.addHandler(handler)

    # Remove stream handlers of all other loggers because coloredlogs installs its own
    for logger in logging.getLogger(None).manager.loggerDict.values():
        if isinstance(logger, logging.Logger):
            logger.handlers = [h for h in logger.handlers if not is_console_handler(h)]
