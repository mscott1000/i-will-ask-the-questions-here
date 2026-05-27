"""Shared lead schema and normalization helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(slots=True)
class Lead:
    id: str
    platform: str
    text: str
    url: str
    posted_at_iso: str
    captured_at_iso: str


def normalize_for_sheet(lead: Lead) -> dict[str, str]:
    captured = datetime.fromisoformat(lead.captured_at_iso.replace("Z", "+00:00"))
    generated = captured.astimezone(timezone.utc).strftime("%m/%d/%y %H:%M")
    site_map = {"x": "X/Twitter", "instagram": "Instagram", "facebook": "Facebook"}
    return {
        "dateGenerated": generated,
        "site": site_map.get(lead.platform.lower(), lead.platform),
        "text": lead.text,
        "postedAt": lead.posted_at_iso,
        "link": lead.url,
    }
