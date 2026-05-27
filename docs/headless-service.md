# Headless Service Mode

This project now supports a **headless runtime** that expands the Tampermonkey concept into a scheduler-driven service.

## What changed

- Added `headless_runner.py` entrypoint.
- Added service runtime orchestration in `shared/runtime.py`.
- Added HTTP retry/backoff adapter in `adapters/http_client.py`.
- Added credential prompt + persistence flow in `adapters/session_store.py`.
- Expanded shared schema/config/sheets utilities for service usage.

## Credential input flow

On first run, if `credentials/runtime.json` is missing, the runtime prompts for:

- X username/password
- Instagram username/password
- Facebook username/password
- Google username/password

Credentials are written to disk so subsequent runs are non-interactive.

## Run

1. Copy `config/service.example.json` to `config/service.json`.
2. Set `sheets.webapp_url` and `sheets.sheet_id`.
3. Run one cycle:

```bash
python3 headless_runner.py --once
```

4. Run continuously:

```bash
python3 headless_runner.py
```

## Notes

Platform extraction modules are intentionally left as extension points. The runner and supporting primitives are now in place for adding Playwright/Puppeteer extraction logic while preserving sheet-ingest compatibility.
