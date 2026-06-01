import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * Gets a browser instance, either local or via @sparticuz/chromium for serverless.
 */
async function getBrowser() {
  const isLocal = process.env.NODE_ENV === 'development' || !process.env.VERCEL;
  
  const options = isLocal
    ? {
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
      }
    : {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      };

  return await puppeteer.launch(options);
}

/**
 * Optimizes a page by blocking unnecessary resources.
 */
async function optimizePage(page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
      // We keep stylesheets if they are critical, but Google Maps usually works without many for basic extraction
      // However, to be safe and avoid layout breaks that hide buttons, we'll only block images/media/fonts
      if (resourceType === 'stylesheet') {
        req.continue();
      } else {
        req.abort();
      }
    } else {
      req.continue();
    }
  });
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

/**
 * Scrapes reviews for a specific business URL.
 */
async function scrapeBusinessDetails(browser, url, targetName, reviewsPerBusiness, minStars, maxStars) {
  const page = await browser.newPage();
  try {
    await optimizePage(page);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Find and click Reviews tab
    const reviewsTabSelector = 'button[role="tab"][aria-label*="Reviews"], button[aria-label*="Reviews"]';
    await page.waitForSelector(reviewsTabSelector, { timeout: 10000 });
    await page.click(reviewsTabSelector);
    await new Promise(r => setTimeout(r, 1000));

    // Extract reviews
    const reviews = await page.evaluate((max, name, minS, maxS) => {
      const results = [];
      const blocks = document.querySelectorAll('div.jJc9Ad, [data-review-id]');
      
      for (const el of blocks) {
        if (results.length >= max) break;
        
        const text = el.querySelector('span.wiI7pd')?.innerText?.trim() || "";
        const starAria = el.querySelector('span.kvMYJc')?.getAttribute('aria-label') || "";
        const stars = parseFloat(starAria.split(' ')[0]) || 0;

        if (text && stars >= minS && stars <= maxS) {
          results.push({
            business_name: name,
            stars: starAria,
            text: text
          });
        }
      }
      return results;
    }, reviewsPerBusiness, targetName, minStars, maxStars);

    return reviews;
  } catch (error) {
    console.error(`[scraper] Error scraping ${targetName}:`, error.message);
    return [];
  } finally {
    await page.close();
  }
}

/**
 * Main entry point for Niche scraping.
 */
export async function scrapeNicheReviews({ searchQuery, location, max_businesses = 2, reviews_per_business = 8, min_stars = 1, max_stars = 5 }) {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await optimizePage(page);

    const query = `${searchQuery} ${location || ''}`.trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    
    console.log(`[scraper] Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });

    // Wait for results
    await page.waitForSelector('div[role="feed"], div[role="article"]', { timeout: 15000 });

    // Collect business links
    const targets = await page.evaluate((max) => {
      const links = [];
      const articles = document.querySelectorAll('div[role="article"]');
      for (const art of articles) {
        if (links.length >= max) break;
        const linkEl = art.querySelector('a.hfpxzc');
        const name = art.getAttribute('aria-label') || "";
        if (linkEl && linkEl.href) {
          links.push({ name, link: linkEl.href });
        }
      }
      return links;
    }, max_businesses);

    await page.close();

    if (targets.length === 0) return [];

    // Parallel extraction
    console.log(`[scraper] Found ${targets.length} targets. Starting parallel extraction...`);
    const results = await Promise.all(
      targets.map(t => scrapeBusinessDetails(browser, t.link, t.name, reviews_per_business, min_stars, max_stars))
    );

    return results.flat();
  } finally {
    await browser.close();
  }
}

/**
 * Main entry point for Competitor scraping.
 */
export async function scrapeCompetitorReviews({ competitorName, location, reviews_per_business = 15, min_stars = 1, max_stars = 5 }) {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await optimizePage(page);

    const query = `${competitorName} ${location}`.trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });

    // Check if direct hit or list
    if (!page.url().includes('place/')) {
      await page.waitForSelector('a.hfpxzc', { timeout: 10000 });
      await page.click('a.hfpxzc');
      await new Promise(r => setTimeout(r, 2000));
    }

    const business_info = await page.evaluate(() => {
      const name = document.querySelector('h1')?.innerText || "Unknown";
      const website = document.querySelector('a[aria-label^="Website:"]')?.href || "N/A";
      const phone = document.querySelector('button[data-item-id^="phone:tel:"]')?.getAttribute('data-item-id')?.replace('phone:tel:', '') || "N/A";
      const address = document.querySelector('button[data-item-id^="address"]')?.getAttribute('aria-label')?.replace('Address: ', '') || "N/A";
      return { name, website, phone, address };
    });

    // Reuse details scraper for the current page state (passing browser and current URL)
    const reviews = await scrapeBusinessDetails(browser, page.url(), business_info.name, reviews_per_business, min_stars, max_stars);

    return { business_info, reviews };
  } finally {
    await browser.close();
  }
}
