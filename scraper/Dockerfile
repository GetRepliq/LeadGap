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

# Set environment variables for Selenium
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/lib/chromium/

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
