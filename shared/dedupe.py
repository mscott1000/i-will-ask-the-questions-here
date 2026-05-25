"""Shared deduplication helpers."""


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
