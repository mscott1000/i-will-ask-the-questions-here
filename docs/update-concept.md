# Update Concept (Applied Direction)

This document is the source of truth for the new direction of the project.

## Direction summary

1. **Tampermonkey-first, with optional Sheets ingest**
   - Use Tampermonkey storage for persistence.
   - Support manual export to JSON/CSV.
   - Support optional automatic upload of unsent entries to a Google Apps Script web app.

2. **Delete unused/duplicate initialization paths**
   - Keep one clear startup routine.

3. **Modern social-feed extraction strategy**
   - Prefer stable training attributes (`data-testid`, `data-post-id`).
   - Fall back to semantic selectors (`role="article"`, `article`, `time[datetime]`).
   - Avoid brittle generated class names.

4. **Persistent evidence/log behavior**
   - Append new matches to local storage.
   - Dedupe by `{platform}:{id}` key.
   - Permit export and manual clear/reset.

5. **Lab-safe operation model**
   - Operate only on approved fake social platforms.
   - Keep scraped data local by default; only send remote when the sheet endpoint configuration is intentionally enabled.

6. **Lead pipeline interoperability**
   - Keep userscript-side normalization aligned with the Apps Script ingest contract.
   - Preserve the checked-in Google Apps Script file (`google-sheet-lead-ingest`) as the current import implementation used by Google Sheets.

## Implementation requirements for future updates

- Continue using storage-first architecture.
- Keep selector logic configurable and easy to update.
- Preserve paste-ready userscript in `tampermonkey/social-feed-monitor.user.js`.
- Keep docs and ingest contract synchronized with fields emitted by `normalizeEntryForSheet` in the userscript.
- Keep user prompts simple for non-developer operators.
