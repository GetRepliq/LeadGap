FROM python:3.11-slim-bookworm

# Chromium + driver from the same Debian release keeps versions aligned.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && chromium --version \
    && chromedriver --version

WORKDIR /app

COPY scraper/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scraper/ .

ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV PYTHONUNBUFFERED=1
# Finish before upstream worker/proxy limits; niche scrape is capped at 1 business.
ENV SCRAPE_BUDGET_SEC=90
ENV PAGE_LOAD_TIMEOUT_SEC=25
ENV SCRIPT_TIMEOUT_SEC=20

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "120"]
