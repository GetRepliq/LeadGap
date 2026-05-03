# Use the full Python image for better library support
FROM python:3.9

# Install Chromium and Chromium Driver
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements from the scraper folder
COPY scraper/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files from the scraper folder
COPY scraper/ .

# Selenium / logging (stderr visible in Render logs immediately)
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/lib/chromium/
ENV PYTHONUNBUFFERED=1
# Niche scrape stops early so the HTTP response returns before upstream (e.g. Vercel) aborts
ENV SCRAPE_BUDGET_SEC=78

# Expose port
EXPOSE 8000

# Long requests: keep-alive helps slow Scrapes; tune on Render if needed
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "120"]
