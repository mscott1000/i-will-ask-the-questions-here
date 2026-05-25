"""Shared configuration loader helpers."""

from pathlib import Path
import json


def load_json_config(path: str | Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
