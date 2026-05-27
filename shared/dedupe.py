"""Shared deduplication helpers."""

from __future__ import annotations

from shared.lead_schema import Lead


def dedupe_by_profile_url(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for row in rows:
        url = (row.get("profile_url") or "").strip().lower()
        if not url or url in seen:
            continue
        seen.add(url)
        deduped.append(row)
    return deduped


def dedupe_by_lead_id(leads: list[Lead]) -> list[Lead]:
    seen: set[str] = set()
    unique: list[Lead] = []
    for lead in leads:
        key = f"{lead.platform}:{lead.id}".lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(lead)
    return unique
