"""Shared configuration loader helpers."""

from __future__ import annotations

from pathlib import Path
import json


def load_json_config(path: str | Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_service_config(path: str | Path) -> dict:
    config = load_json_config(path)
    required_top_level = ["platforms", "interval_minutes", "sheets"]
    missing = [key for key in required_top_level if key not in config]
    if missing:
        raise ValueError(f"Missing required config keys: {', '.join(missing)}")
    return config
