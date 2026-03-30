## **Overall Backend Flow:** ⤵️

1. User interacts with your React frontend (`leadgap/app/webapp/page.js`).
2. Frontend sends a request (e.g., `fetch('/api/agent-endpoint', { method: 'POST', body: JSON.stringify({ command: 'Analyze Cafes in London' }) })`) to your Vercel-hosted API route.
3. The Node.js `agent-endpoint.js` serverless function executes:
    - It uses its Node.js logic to classify intent, orchestrate the process.
    - If scraping is needed, it spawns `utils.py` with `child_process`, passing parameters.
    - `utils.py` performs the scrape using the serverless-compatible headless Chromium.
    - It processes the scraped data.
    - If caching is needed, it spawns `memory.py` with `child_process`, passing the processed data.
    - `memory.py` interacts with Supabase to store or retrieve market intelligence.
    - The Node.js function compiles the final result.
4. The Node.js function sends a JSON response back to the frontend.
5. Frontend updates the UI with the results.

This approach allows you to keep your existing Node.js and Python logic, integrate a robust database, and leverage Vercel's seamless deployment for both your frontend and serverless backend.

# **Backend Structure Breakdown** 🧱

### **1. Vercel Serverless Functions as Your Backend**

Vercel allows you to deploy serverless functions alongside your Next.js frontend. These functions can be written in Node.js (JavaScript/TypeScript), Python, Go, or Ruby.

- **Next.js API Routes (`/leadgap/app/api/**`):** The most straightforward approach for your project is to create API routes within your existing Next.js app (e.g., in `leadgap/app/api`). Each file in this directory (e.g., `leadgap/app/api/agent-endpoint.js`) becomes a serverless function accessible via HTTP. These are primarily Node.js environments.

### **2. Orchestrating Node.js and Python on Vercel**

Since you want to keep both Node.js and Python, the Node.js API route will act as the orchestrator:

- **Node.js API Route (`agent-endpoint.js`):**
    - This will be the entry point for requests from your frontend (`page.js`).
    - It will contain the core logic from `cli/core/agent.js` (adapted for a web context, meaning removing `cli-table3` and `fs` operations for `market_info.json` directly).
    - When this Node.js function needs to execute Python logic (like `memory.py` for cache generation or `utils.py` for scraping), it will continue to use `child_process.spawn('python3', [pythonScriptPath])` as you currently do in `agent.js`.
- **Python Scripts (`memory.py`, `utils.py`):**
    - These Python files would be deployed alongside your Node.js API route. Vercel automatically detects Python files and includes the Python runtime.
    - **Dependencies:** Ensure your `requirements.txt` (from `cli/requirements.txt`) is present at the root of your project or in a location Vercel can find it, so it installs `selenium`, `google-generativeai`, `webdriver_manager`, etc., during deployment.

### **3. Supabase Integration for Cache and Data**

Supabase (which provides a PostgreSQL database) is a perfect fit for replacing your `market_info.json` and for general data storage:

- **Replace `market_info.json`:**
    - The `memory.py` script's logic for reading/writing `market_info.json` will need to be updated. You'll use a PostgreSQL client library (e.g., `psycopg2` in Python or `@supabase/supabase-js` for Node.js) to connect to your Supabase database.
    - You'd create tables in Supabase to store the structured market intelligence data that `memory.py` currently generates.
- **Secure Credentials:** Your Supabase connection URL and API keys will be stored as environment variables directly in your Vercel project settings, making them securely accessible to your serverless functions (but *not* to your frontend code).

### **4. Handling Selenium (Web Scraping) on Vercel**

This is the most critical part for `utils.py` as serverless environments are stateless and don't typically have a full Chrome browser pre-installed:

- You will need to adapt `utils.py` to use a headless Chromium solution specifically designed for serverless environments. The most common choice is `chrome-aws-lambda` (for Node.js, but there are Python equivalents or direct methods).
- This usually involves:
    1. Installing `selenium-webdriver` (Node.js) or `selenium` (Python) and a compatible driver for `chrome-aws-lambda`.
    2. Configuring the `webdriver` in `utils.py` to launch Chromium from `chrome-aws-lambda`'s executable path, rather than relying on `ChromeDriverManager` to download a system-wide browser.
- This specific setup can be a bit tricky, but it's a well-documented pattern for running Selenium on AWS Lambda (which Vercel's serverless functions are built on).