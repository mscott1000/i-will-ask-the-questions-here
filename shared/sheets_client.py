"""Shared Google Sheets webapp client."""

from __future__ import annotations

from datetime import datetime, timezone
import requests


class SheetsClient:
    def __init__(self, webapp_url: str, spreadsheet_id: str) -> None:
        self.webapp_url = webapp_url
        self.spreadsheet_id = spreadsheet_id

    @property
    def enabled(self) -> bool:
        return bool(self.webapp_url and self.spreadsheet_id)

    def post_entries(self, entries: list[dict[str, str]]) -> None:
        if not self.enabled or not entries:
            return

        payload = {
            "sheetId": self.spreadsheet_id,
            "dateGenerated": datetime.now(timezone.utc).strftime("%m/%d/%y %H:%M"),
            "entries": entries,
        }
        response = requests.post(self.webapp_url, json=payload, timeout=30)
        response.raise_for_status()
