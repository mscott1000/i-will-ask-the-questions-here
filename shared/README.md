# Shared module

This directory is the single source of truth for reusable scraping pipeline logic that is synchronized into platform-specific repositories.

## Expected contents
- `lead_schema.py`: shared lead shape and normalization.
- `dedupe.py`: shared deduplication helpers.
- `sheets_client.py`: shared Google Sheets write client.
- `config_loader.py`: shared configuration parsing.
- `logging_utils.py`: shared logging format and helpers.

## Sync behavior
Changes under `shared/` and `platform_specs/` trigger the GitHub Action workflow at `.github/workflows/sync-platform-repos.yml`, which creates per-repo pull requests in:
- `mscott1000/Facebook-Scraper`
- `mscott1000/instaloader`
- `mscott1000/Scweet`
