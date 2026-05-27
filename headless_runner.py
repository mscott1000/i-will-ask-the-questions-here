"""Headless social feed monitor service entrypoint.

This module adapts the Tampermonkey flow into a scheduler-driven Python service.
"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

from shared.config_loader import load_service_config
from shared.logging_utils import configure_logging
from shared.runtime import ServiceRuntime


LOGGER = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the headless social feed monitor")
    parser.add_argument(
        "--config",
        default="config/service.json",
        help="Path to service configuration JSON",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single scrape cycle and exit",
    )
    parser.add_argument(
        "--log-level",
        default=os.getenv("SFM_LOG_LEVEL", "INFO"),
        help="Python log level",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    configure_logging(level_name=args.log_level)

    config_path = Path(args.config)
    config = load_service_config(config_path)

    runtime = ServiceRuntime(config)

    if args.once:
        LOGGER.info("Running single headless cycle")
        runtime.run_cycle()
        return 0

    LOGGER.info("Starting continuous scheduler")
    runtime.run_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
