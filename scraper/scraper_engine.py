import json
import shutil
import sys
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException


def eprint(*args: Any, **kwargs: Any) -> None:
    print(*args, file=sys.stderr, **kwargs)


def get_driver():
    chrome_bin = shutil.which("chromium") or "/usr/bin/chromium"
    driver_bin = shutil.which("chromedriver") or "/usr/bin/chromedriver"

    chrome_options = Options()
    chrome_options.binary_location = chrome_bin
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--disable-plugins")
    chrome_options.add_argument("--blink-settings=imagesEnabled=false")
    chrome_options.add_argument("--disable-background-networking")
    chrome_options.add_argument("--disable-default-apps")
    chrome_options.add_argument("--disable-sync")
    chrome_options.add_argument("--disable-translate")
    chrome_options.add_argument("--hide-scrollbars")
    chrome_options.add_argument("--mute-audio")
    chrome_options.add_argument("--no-first-run")
    chrome_options.add_argument("--disable-background-timer-throttling")
    chrome_options.add_argument("--disable-renderer-backgrounding")
    chrome_options.add_argument("--disable-backgrounding-occluded-windows")
    chrome_options.add_argument("--disable-client-side-phishing-detection")
    chrome_options.add_argument("--disable-component-extensions-with-background-pages")
    chrome_options.add_argument("--aggressive-cache-discard")
    chrome_options.add_argument("--memory-pressure-off")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    service = Service(executable_path=driver_bin)
    try:
        return webdriver.Chrome(service=service, options=chrome_options)
    except WebDriverException as e:
        eprint("[scraper] Chrome startup failed:", e)
        raise


def filter_reviews(reviews: List[dict], min_word_count: int = 5) -> List[dict]:
    unique_reviews = []
    seen_texts = set()
    for review in reviews:
        review_text = review.get("text")
        if not review_text or review_text in seen_texts:
            continue
        if len(review_text.split()) < min_word_count:
            continue
        seen_texts.add(review_text)
        unique_reviews.append(review)
    return unique_reviews


def _maps_search_url(search_query: str, location: Optional[str]) -> str:
    parts = [search_query.strip()]
    if location and str(location).strip() and str(location).strip().lower() != "unknown location":
        parts.append(str(location).strip())
    q = " ".join(parts)
    return "https://www.google.com/maps/search/" + quote_plus(q)


def dismiss_cookie_consent(driver) -> None:
    short_wait = WebDriverWait(driver, 5)
    attempts = [
        (By.CSS_SELECTOR, "button[aria-label*='Reject']"),
        (By.CSS_SELECTOR, "button[aria-label*='reject']"),
        (By.XPATH, "//button[contains(., 'Reject all')]"),
        (By.XPATH, "//button[contains(., 'Accept all')]"),
        (By.CSS_SELECTOR, "[aria-modal='true'] button"),
    ]
    for by, sel in attempts:
        try:
            btn = short_wait.until(EC.element_to_be_clickable((by, sel)))
            btn.click()
            time.sleep(0.6)
            return
        except Exception:
            continue


def scroll_results_feed(driver, rounds: int = 8) -> None:
    try:
        feed = driver.find_element(By.CSS_SELECTOR, "div[role='feed']")
        for _ in range(rounds):
            driver.execute_script(
                "arguments[0].scrollTop = arguments[0].scrollHeight",
                feed,
            )
            time.sleep(0.35)
    except Exception as ex:
        eprint("[scraper] feed scroll skipped:", ex)


def _listing_link_selectors():
    return [
        "a.hfpxzc",
        "a[href*='/maps/place/']",
    ]


def collect_place_targets(driver, max_businesses: int) -> List[Dict[str, str]]:
    targets: List[Dict[str, str]] = []
    seen_urls = set()

    scroll_results_feed(driver)

    articles = driver.find_elements(By.CSS_SELECTOR, "div[role='article']")
    for biz in articles:
        if len(targets) >= max_businesses:
            break
        name = (biz.get_attribute("aria-label") or "").strip()
        link = ""
        for css in _listing_link_selectors():
            try:
                link_el = biz.find_element(By.CSS_SELECTOR, css)
                link = (link_el.get_attribute("href") or "").strip()
                if "/maps/place/" in link:
                    break
            except Exception:
                continue
        if link and "/maps/place/" in link and link not in seen_urls:
            seen_urls.add(link)
            targets.append({"name": name or link, "link": link})

    if len(targets) < max_businesses:
        try:
            feed_links = driver.find_elements(
                By.CSS_SELECTOR, "div[role='feed'] a[href*='/maps/place/']"
            )
            for a in feed_links:
                if len(targets) >= max_businesses:
                    break
                link = (a.get_attribute("href") or "").strip()
                if not link or link in seen_urls:
                    continue
                seen_urls.add(link)
                label = (a.get_attribute("aria-label") or a.text or link).strip()
                targets.append({"name": label, "link": link})
        except Exception as ex:
            eprint("[scraper] fallback feed links:", ex)

    return targets[:max_businesses]


def open_reviews_tab(driver) -> bool:
    selectors = [
        (By.XPATH, "//button[@role='tab'][contains(., 'Reviews')]"),
        (By.CSS_SELECTOR, "button[aria-label*='Reviews']"),
        (By.XPATH, "//div[@role='tab'][contains(., 'Reviews')]"),
    ]
    for by, sel in selectors:
        try:
            tab = WebDriverWait(driver, 8).until(EC.element_to_be_clickable((by, sel)))
            tab.click()
            time.sleep(1.5)
            return True
        except Exception:
            continue
    return False


def extract_review_blocks(driver, reviews_per_business: int, target_name: str, min_stars: float, max_stars: float) -> List[dict]:
    rows: List[dict] = []
    review_elements = driver.find_elements(By.CSS_SELECTOR, "div.jJc9Ad")
    if not review_elements:
        review_elements = driver.find_elements(By.CSS_SELECTOR, "[data-review-id]")
    for el in review_elements[: reviews_per_business * 2]:
        if len(rows) >= reviews_per_business:
            break
        try:
            text = ""
            for span_sel in ("span.wiI7pd", "span[class*='review']"):
                try:
                    text = el.find_element(By.CSS_SELECTOR, span_sel).text.strip()
                    if text:
                        break
                except Exception:
                    continue
            stars = 0.0
            star_aria = ""
            for star_sel in ("span.kvMYJc", "[aria-label*='star']"):
                try:
                    star_aria = el.find_element(By.CSS_SELECTOR, star_sel).get_attribute("aria-label") or ""
                    if star_aria:
                        stars = float(star_aria.split()[0])
                        break
                except Exception:
                    continue
            if text and min_stars <= stars <= max_stars:
                rows.append({"business_name": target_name, "stars": star_aria, "text": text})
        except Exception:
            continue
    return rows


def scrape_all_business_reviews(
    search_query: str,
    location: Optional[str] = None,
    max_businesses: int = 3,
    reviews_per_business: int = 10,
    min_stars: int = 1,
    max_stars: int = 5,
) -> List[dict]:
    driver = get_driver()
    all_reviews_data: List[dict] = []

    try:
        url = _maps_search_url(search_query, location)
        eprint("[scraper] niche maps URL:", url)
        driver.get(url)

        dismiss_cookie_consent(driver)

        loaded = False
        for css in ("div[role='feed']", "div[role='article']"):
            try:
                WebDriverWait(driver, 18).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, css))
                )
                loaded = True
                break
            except TimeoutException:
                continue
        if not loaded:
            eprint("[scraper] timeout waiting for results feed/articles")
            return []

        time.sleep(1)
        targets = collect_place_targets(driver, max_businesses)
        eprint("[scraper] targets collected:", len(targets), json.dumps([t["name"] for t in targets]))

        if not targets:
            eprint("[scraper] no listing URLs found (selectors/DOM mismatch or blocking)")
            return []

        ms = float(min_stars)
        xs = float(max_stars)

        for target in targets:
            try:
                driver.get(target["link"])
                time.sleep(2)
                if not open_reviews_tab(driver):
                    eprint("[scraper] reviews tab not found for:", target["name"])
                    continue
                time.sleep(1)
                rows = extract_review_blocks(
                    driver, reviews_per_business, target["name"], ms, xs
                )
                all_reviews_data.extend(rows)
            except Exception as ex:
                eprint("[scraper] business loop error:", target.get("name"), ex)
                continue

        out = filter_reviews(all_reviews_data)
        eprint("[scraper] niche complete, review count:", len(out))
        return out
    finally:
        driver.quit()


def scrape_competitor_reviews(
    competitor_name: str,
    location: str,
    reviews_per_business: int = 20,
    min_stars: int = 1,
    max_stars: int = 5,
) -> Dict[str, Any]:
    driver = get_driver()
    try:
        search_query = f"{competitor_name} {location}".strip()
        url = _maps_search_url(search_query, None)
        eprint("[scraper] competitor maps URL:", url)
        driver.get(url)
        time.sleep(3)

        dismiss_cookie_consent(driver)

        if "place/" not in driver.current_url:
            try:
                WebDriverWait(driver, 12).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "div[role='feed'], div[role='article']"))
                )
                scroll_results_feed(driver, rounds=4)
                link_el = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "a.hfpxzc, a[href*='/maps/place/']"))
                )
                link_el.click()
                time.sleep(3)
            except Exception as ex:
                eprint("[scraper] competitor first-result click failed:", ex)

        biz_info = {"name": competitor_name, "website": "N/A", "phone": "N/A", "address": "N/A"}
        try:
            h1 = driver.find_element(By.CSS_SELECTOR, "h1").text
            if h1:
                biz_info["name"] = h1
            web = driver.find_elements(By.CSS_SELECTOR, "a[aria-label^='Website:']")
            if web:
                biz_info["website"] = web[0].get_attribute("href")
        except Exception:
            pass

        if not open_reviews_tab(driver):
            eprint("[scraper] competitor reviews tab missing")
            return {"business_info": biz_info, "reviews": []}

        ms = float(min_stars)
        xs = float(max_stars)
        rows = extract_review_blocks(driver, reviews_per_business, biz_info["name"], ms, xs)

        return {"business_info": biz_info, "reviews": filter_reviews(rows)}
    finally:
        driver.quit()
