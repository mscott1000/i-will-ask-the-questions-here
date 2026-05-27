"""Session/cookie handling for authenticated platform access."""

from __future__ import annotations

from pathlib import Path
import getpass
import json


class SessionStore:
    def __init__(self, config: dict) -> None:
        self.credentials_path = Path(config.get("credentials_path", "credentials/runtime.json"))

    def load_or_prompt_credentials(self) -> dict:
        if self.credentials_path.exists():
            return json.loads(self.credentials_path.read_text(encoding="utf-8"))

        creds = {
            "x_username": input("X username: "),
            "x_password": getpass.getpass("X password: "),
            "instagram_username": input("Instagram username: "),
            "instagram_password": getpass.getpass("Instagram password: "),
            "facebook_username": input("Facebook username: "),
            "facebook_password": getpass.getpass("Facebook password: "),
            "google_username": input("Google username: "),
            "google_password": getpass.getpass("Google password: "),
        }
        self.credentials_path.parent.mkdir(parents=True, exist_ok=True)
        self.credentials_path.write_text(json.dumps(creds, indent=2), encoding="utf-8")
        return creds
