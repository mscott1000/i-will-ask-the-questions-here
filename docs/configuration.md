# Configuration Guide

Use the in-page **SFM** popup while on a matched site.

## Popup controls

- **Enable monitor** – turn automated monitoring on/off.
- **Auto-rotate search pages each cycle** – when enabled, every scan cycle advances to the next Google/Instagram/Facebook search URL.
- **Keywords** – comma/newline-separated terms to search in post text.
- **Locations** – comma/newline-separated location tokens to match in text/location fields.
- **Automatic check interval (minutes)** – scraping cadence (default: **30 minutes**).
- **Use 30 minutes** – quick-set the interval to the default half-hour cadence.
- **Run now** – trigger an immediate scrape pass.
- **Export JSON / Export CSV** – download local records.
- **Clear stored data** – remove collected records.
- **Show status** – quick count, keywords, locations, and monitor state.

## Automatic Google Sheets lead sync

The userscript now includes a background sender that posts **new unsent entries** from local storage to a deployed Google Apps Script Web App.

- Outbound payload format: `{ sheetId, dateGenerated, entries[] }`.
- `dateGenerated` is sent in `MM/dd/yy HH:mm` format.
- Entries are normalized to the five-sheet-column structure used by the ingest script:
  1. Date Generated
  2. Site (`Instagram`, `Facebook`, `X/Twitter`)
  3. Text
  4. Posted At
  5. Link
- Sent-entry tracking is stored in Tampermonkey under `social_post_leads_sent_entry_ids_v1` so only new records are forwarded after a successful response.
- Web app endpoint and sheet id are controlled in `tampermonkey/social-feed-monitor.user.js` (`SHEETS_WEBAPP_URL` and `SHEETS_SHEET_ID`).

The current Google Apps Script used by production is checked in at `google-sheet-lead-ingest`.

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

For Google Sheets delivery, records are normalized to:

- `dateGenerated`
- `site`
- `text`
- `postedAt`
- `link`

## Operational tips

- Start with precise keywords and locations.
- Keep the default 30-minute cadence for hands-off automation unless your lab needs a faster interval.
- For concept-driven prospecting, keep **Auto-rotate search pages each cycle** enabled so the script continuously walks through its expanded search plans.
- Export before clearing data.
- On Instagram `explore/locations/*` pages, keep the tab open while logged in so the script can fetch metadata from discovered post links.
- If Google Sheets sync is enabled/configured, keep at least one matched tab active periodically so unsent entries can be posted and marked as sent.
