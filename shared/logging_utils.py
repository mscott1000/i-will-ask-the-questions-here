"""Shared logging helpers."""

from __future__ import annotations

import logging


def configure_logging(level: int = logging.INFO, level_name: str | None = None) -> None:
    active_level = getattr(logging, level_name.upper(), level) if level_name else level
    logging.basicConfig(
        level=active_level,
        format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
    )
