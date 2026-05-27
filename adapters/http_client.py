"""HTTP client wrapper with retries/backoff for platform calls."""

from __future__ import annotations

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class HttpClient:
    def __init__(self, config: dict) -> None:
        self.session = requests.Session()
        retries = Retry(
            total=int(config.get("http", {}).get("retries", 3)),
            backoff_factor=float(config.get("http", {}).get("backoff_seconds", 1.0)),
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
