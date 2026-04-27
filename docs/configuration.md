# Configuration Guide

Use Tampermonkey menu commands while on a matched site.

## Menu commands

- **Set Keywords** – comma-separated terms to search in post text.
- **Set Locations** – comma-separated location tokens to match in text/location fields.
- **Set Check Interval (ms)** – scraping cadence (default: 5000).
- **Export Data (JSON)** – download local records.
- **Export Data (CSV)** – download local records in spreadsheet format.
- **Clear Stored Data** – remove collected records.
- **Show Status** – quick count, keywords, and locations.

## Data model

Each collected record stores:

- `id`
- `platform`
- `user`
- `text`
- `location`
- `url`
- `time` (post timestamp if available)
- `capturedAt` (when script captured it)
- `matchedKeywords`
- `matchedLocations`

## Operational tips

- Start with precise keywords and locations.
- Keep intervals reasonable (3–10 seconds) in dynamic feeds.
- Export before clearing data.
- On Instagram `explore/locations/*` pages, keep the tab open while logged in so the script can fetch metadata from discovered post links.
