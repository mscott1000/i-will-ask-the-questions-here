# IWATQH Social Feed Monitor (Tampermonkey)

This repository turns the original single-script prototype into a maintainable project layout for iterative updates.

## Repository layout

- `tampermonkey/social-feed-monitor.user.js` – the production Tampermonkey script (copy/paste-ready).
- `docs/update-concept.md` – project direction and design decisions used for future edits.
- `docs/configuration.md` – quick setup for test-lab usage.
- `CODEX_UPDATE_REMINDER.md` – reminder for future Codex edits to always update script date/version.
- `archive/IWATQH-original.rtf` – preserved original source artifact from project start.

## What changed from the original concept

- Removed server/database dependency from the default workflow.
- Added persistent local storage (`GM_setValue`) with dedupe.
- Added export options (JSON/CSV).
- Added menu-driven configuration for keywords and locations.
- Switched to modern, resilient selector strategy (`data-testid`, `role`, `article`, accessibility labels, and fallbacks).
- Added Instagram location-page fallback that can inspect discovered `/p/` and `/reel/` links for caption/location metadata.

See `docs/update-concept.md` for the direction this repository follows.

## Quick start

1. Install Tampermonkey.
2. Open `tampermonkey/social-feed-monitor.user.js`.
3. Copy/paste into a new Tampermonkey script.
4. Save and enable.
5. Visit one of your lab domains:
   - `*.x.com`
   - `*.instagram.com`
   - `*.facebook.com`
6. Use Tampermonkey menu commands to configure and export data.

## Notes

This tool is intended for controlled, instructor-approved lab environments only.
