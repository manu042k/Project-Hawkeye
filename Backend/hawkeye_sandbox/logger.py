from __future__ import annotations

import logging
import os


def setup_logging(
    *,
    level: str | None = None,
    logger_name: str = "hawkeye_sandbox",
) -> logging.Logger:
    """
    Configure and return the package logger.

    - Default level comes from env `HAWKEYE_LOG_LEVEL` or INFO.
    - Safe to call multiple times (won't double-add handlers).
    """
    log_level = (level or os.getenv("HAWKEYE_LOG_LEVEL", "INFO")).upper()
    logger = logging.getLogger(logger_name)
    logger.setLevel(log_level)

    if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s %(levelname)s %(name)s: %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(handler)

    logger.propagate = False
    return logger


def get_logger(name: str = "hawkeye_sandbox") -> logging.Logger:
    """
    Get a logger configured by `setup_logging()` (auto-configures on first use).
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        setup_logging(logger_name=name)
    return logger

