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
- Keep the default 30-minute cadence for hands-off automation unless your lab needs a faster interval.
- For concept-driven prospecting, keep **Auto-rotate search pages each cycle** enabled so the script continuously walks through its expanded search plans.
- Export before clearing data.
- On Instagram `explore/locations/*` pages, keep the tab open while logged in so the script can fetch metadata from discovered post links.
