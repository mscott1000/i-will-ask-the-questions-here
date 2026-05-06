# Codex Update Reminder (Mandatory)

Whenever any project behavior, logic, selector, storage format, or configuration changes:

1. **Always update** `tampermonkey/social-feed-monitor.user.js` so it stays the canonical paste-ready script.
2. **Always bump** the `@version` value in the userscript header.
3. **Always update** the `LAST_UPDATED` constant in the script to the date of the change (`YYYY-MM-DD`).

Do not merge changes that modify project behavior without updating the userscript version/date.
