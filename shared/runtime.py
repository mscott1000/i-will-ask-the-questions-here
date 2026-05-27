"""Runtime orchestration for the headless monitoring service."""

from __future__ import annotations

import logging
import time

from adapters.http_client import HttpClient
from adapters.session_store import SessionStore
from shared.lead_schema import Lead, normalize_for_sheet
from shared.sheets_client import SheetsClient
from shared.dedupe import dedupe_by_lead_id

LOGGER = logging.getLogger(__name__)


class ServiceRuntime:
    def __init__(self, config: dict) -> None:
        self.config = config
        self.session_store = SessionStore(config)
        self.http = HttpClient(config)
        self.sheets = SheetsClient(
            webapp_url=config.get("sheets", {}).get("webapp_url", ""),
            spreadsheet_id=config.get("sheets", {}).get("sheet_id", ""),
        )

    def run_cycle(self) -> list[Lead]:
        leads: list[Lead] = []

        # Placeholder extraction hooks by platform.
        for platform in self.config.get("platforms", []):
            LOGGER.info("Collecting leads from %s", platform)

        unique = dedupe_by_lead_id(leads)

        if unique and self.sheets.enabled:
            rows = [normalize_for_sheet(lead) for lead in unique]
            self.sheets.post_entries(rows)

        LOGGER.info("Cycle complete: %s unique leads", len(unique))
        return unique

    def run_forever(self) -> None:
        interval_s = int(self.config.get("interval_minutes", 30)) * 60
        while True:
            try:
                self.run_cycle()
            except Exception:  # nosec B110
                LOGGER.exception("Cycle failed")
            time.sleep(interval_s)
