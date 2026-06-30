# Scraper service (Render)

Python FastAPI service that runs headless Chromium to scrape Google Maps reviews.

## Deploy on Render

1. Create a **Web Service** from this repo.
2. Set **Dockerfile path** to `scraper/Dockerfile` (repo root context).
3. After deploy, verify:

```bash
curl https://<your-scraper>.onrender.com/
curl https://<your-scraper>.onrender.com/diagnostics
```

`/diagnostics` must return `{"ok": true, ...}`. If it returns 500, check Render logs for Chrome/Chromium errors.

4. Set `SCRAPER_URL=https://<your-scraper>.onrender.com/scrape` on your Next.js API (Vercel/Render).

## Local smoke test (requires Chromium)

```bash
cd scraper
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
curl http://localhost:8000/diagnostics
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `SCRAPE_BUDGET_SEC` | `90` | Max wall time per scrape |
| `PAGE_LOAD_TIMEOUT_SEC` | `25` | Selenium page load timeout |
| `CHROME_BIN` | `/usr/bin/chromium` | Chromium binary |
| `CHROMEDRIVER_PATH` | `/usr/bin/chromedriver` | ChromeDriver binary |

## Common failures

- **502 / empty body**: Chromium OOM or hung scrape — reduce `max_businesses` / `reviews_per_business` in the API caller.
- **500 `Can not connect to chromedriver`**: Chromium/driver version mismatch — redeploy with the current Dockerfile (`python:3.11-slim-bookworm`).
