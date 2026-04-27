# Update Concept (Applied Direction)

This document is the source of truth for the new direction of the project.

## Direction summary

1. **No required backend/server by default**
   - Use Tampermonkey storage for persistence.
   - Export manually to JSON or CSV as needed.

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
   - Keep all scraped data local unless user explicitly exports.

## Implementation requirements for future updates

- Continue using storage-first architecture.
- Keep selector logic configurable and easy to update.
- Preserve paste-ready userscript in `tampermonkey/social-feed-monitor.user.js`.
- Keep user prompts simple for non-developer operators.
