import json
import os
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


def _scrape_budget_deadline() -> float:
    """Wall-clock limit so the API responds before upstream (Vercel) fetch timeout."""
    sec = float(os.environ.get("SCRAPE_BUDGET_SEC", "78"))
    return time.monotonic() + sec


def _over_budget(deadline: float) -> bool:
    return time.monotonic() > deadline


def _chrome_options() -> Options:
    chrome_bin = os.environ.get("CHROME_BIN") or shutil.which("chromium") or "/usr/bin/chromium"
    chrome_options = Options()
    chrome_options.binary_location = chrome_bin
    chrome_options.page_load_strategy = "normal"
    chrome_options.add_experimental_option(
        "prefs", {"intl.accept_languages": "en,en_US"}
    )
    for arg in (
        "--headless=new",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--lang=en-US",
        "--disable-extensions",
        "--blink-settings=imagesEnabled=false",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-first-run",
        "--disable-software-rasterizer",
        "--disable-blink-features=AutomationControlled",
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ):
        chrome_options.add_argument(arg)
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    return chrome_options


def get_driver():
    chrome_options = _chrome_options()
    driver_bin = os.environ.get("CHROMEDRIVER_PATH") or shutil.which("chromedriver") or "/usr/bin/chromedriver"

    attempts = []
    if os.path.isfile(driver_bin):
        attempts.append(("system-chromedriver", Service(executable_path=driver_bin)))

    # Selenium Manager can download a driver matched to the Chromium binary.
    attempts.append(("selenium-manager", Service()))

    last_error = None
    for label, service in attempts:
        try:
            eprint(f"[scraper] starting Chrome via {label} (driver={getattr(service, 'path', driver_bin)})")
            driver = webdriver.Chrome(service=service, options=chrome_options)
            driver.set_page_load_timeout(int(os.environ.get("PAGE_LOAD_TIMEOUT_SEC", "25")))
            driver.set_script_timeout(int(os.environ.get("SCRIPT_TIMEOUT_SEC", "20")))
            return driver
        except WebDriverException as e:
            last_error = e
            eprint(f"[scraper] Chrome startup failed ({label}):", e)
            continue

    raise WebDriverException(f"Chrome could not start: {last_error}")


def filter_reviews(reviews: List[dict], min_word_count: int = 3) -> List[dict]:
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
    short_wait = WebDriverWait(driver, 2)
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
            time.sleep(0.4)
            return
        except Exception:
            continue


def scroll_results_feed(driver, rounds: int = 4) -> None:
    try:
        feed = driver.find_element(By.CSS_SELECTOR, "div[role='feed']")
        for _ in range(rounds):
            driver.execute_script(
                "arguments[0].scrollTop = arguments[0].scrollHeight",
                feed,
            )
            time.sleep(0.22)
    except Exception as ex:
        eprint("[scraper] feed scroll skipped:", ex)


def _listing_link_selectors():
    return [
        "a.hfpxzc",
        "a[href*='/maps/place/']",
    ]


def _page_block_reason(driver) -> Optional[str]:
    try:
        src = (driver.page_source or "").lower()
        title = (driver.title or "").lower()
    except Exception:
        return None
    if "unusual traffic" in src or "captcha" in src or "/sorry/" in driver.current_url:
        return "google_captcha"
    if "before you continue" in src or "consent.google" in driver.current_url:
        return "google_consent_wall"
    if title in ("google maps", "") and "role=\"feed\"" not in src and "/maps/place/" not in driver.current_url:
        return "maps_not_loaded"
    return None


def _parse_star_value(star_aria: str) -> Optional[float]:
    if not star_aria:
        return None
    for token in star_aria.replace(",", ".").split():
        try:
            return float(token)
        except ValueError:
            continue
    return None


def scroll_reviews_panel(driver, rounds: int = 5) -> None:
    selectors = (
        "div[role='main'] div.m6QErb.DxyBCb",
        "div[role='main'] div.m6QErb",
        "div[role='main']",
    )
    for css in selectors:
        try:
            panel = driver.find_element(By.CSS_SELECTOR, css)
            for _ in range(rounds):
                driver.execute_script(
                    "arguments[0].scrollTop = arguments[0].scrollHeight",
                    panel,
                )
                time.sleep(0.35)
            return
        except Exception:
            continue


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


def open_reviews_tab(driver, timeout: float = 8.0) -> bool:
    xpath = (
        "//button[@role='tab'][contains(., 'Reviews')] | "
        "//div[@role='tab'][contains(., 'Reviews')] | "
        "//button[contains(@aria-label, 'Reviews')] | "
        "//button[contains(@aria-label, 'reviews')]"
    )
    try:
        tab = WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((By.XPATH, xpath))
        )
        tab.click()
        time.sleep(1.0)
        scroll_reviews_panel(driver)
        return True
    except Exception:
        return False


def extract_review_blocks(driver, reviews_per_business: int, target_name: str, min_stars: float, max_stars: float) -> List[dict]:
    rows: List[dict] = []
    review_elements: List[Any] = []
    for css in ("div.jftiEf", "div.jJc9Ad", "[data-review-id]"):
        review_elements = driver.find_elements(By.CSS_SELECTOR, css)
        if review_elements:
            eprint(f"[scraper] review blocks via {css}: {len(review_elements)}")
            break

    text_selectors = (
        "span.wiI7pd",
        "div.wiI7pd",
        "div.MyEned span",
        "span[class*='wiI7pd']",
    )
    star_selectors = ("span.kvMYJc", "span[role='img'][aria-label*='star']", "[aria-label*='stars']")

    for el in review_elements[: reviews_per_business * 3]:
        if len(rows) >= reviews_per_business:
            break
        try:
            text = ""
            for span_sel in text_selectors:
                try:
                    text = el.find_element(By.CSS_SELECTOR, span_sel).text.strip()
                    if text:
                        break
                except Exception:
                    continue
            if not text:
                continue

            stars: Optional[float] = None
            star_aria = ""
            for star_sel in star_selectors:
                try:
                    star_aria = el.find_element(By.CSS_SELECTOR, star_sel).get_attribute("aria-label") or ""
                    if star_aria:
                        stars = _parse_star_value(star_aria)
                        if stars is not None:
                            break
                except Exception:
                    continue

            if stars is None:
                rows.append({"business_name": target_name, "stars": star_aria or "unknown", "text": text})
            elif min_stars <= stars <= max_stars:
                rows.append({"business_name": target_name, "stars": star_aria, "text": text})
        except Exception:
            continue
    return rows


def probe_maps_search(search_query: str, location: Optional[str] = None) -> Dict[str, Any]:
    """Lightweight probe for debugging empty scrapes (no review extraction)."""
    driver = get_driver()
    try:
        url = _maps_search_url(search_query, location)
        driver.get(url)
        dismiss_cookie_consent(driver)
        time.sleep(2.0)

        blocked = _page_block_reason(driver)
        feed_count = len(driver.find_elements(By.CSS_SELECTOR, "div[role='feed']"))
        article_count = len(driver.find_elements(By.CSS_SELECTOR, "div[role='article']"))
        place_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='/maps/place/']")
        targets = collect_place_targets(driver, 3)

        return {
            "url": url,
            "current_url": driver.current_url,
            "title": driver.title,
            "blocked": blocked,
            "feed_count": feed_count,
            "article_count": article_count,
            "place_link_count": len(place_links),
            "targets": targets,
        }
    finally:
        driver.quit()


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
    deadline = _scrape_budget_deadline()

    try:
        url = _maps_search_url(search_query, location)
        eprint("[scraper] niche maps URL:", url)
        driver.get(url)

        dismiss_cookie_consent(driver)
        time.sleep(1.0)

        blocked = _page_block_reason(driver)
        if blocked:
            eprint("[scraper] maps blocked:", blocked, "url:", driver.current_url)
            return []

        # Search sometimes redirects straight to a single place page.
        if "/maps/place/" in driver.current_url:
            name = driver.current_url
            try:
                h1 = driver.find_element(By.CSS_SELECTOR, "h1").text.strip()
                if h1:
                    name = h1
            except Exception:
                pass
            targets = [{"name": name, "link": driver.current_url}]
            eprint("[scraper] direct place URL:", name)
        else:
            loaded = False
            for css in ("div[role='feed']", "div[role='article']"):
                if _over_budget(deadline):
                    eprint("[scraper] budget hit while waiting for results")
                    return filter_reviews(all_reviews_data)
                try:
                    WebDriverWait(driver, 15).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, css))
                    )
                    loaded = True
                    break
                except TimeoutException:
                    continue
            if not loaded:
                reason = _page_block_reason(driver) or "results_feed_timeout"
                eprint("[scraper] timeout waiting for results feed/articles:", reason)
                return []

            time.sleep(0.8)
            targets = collect_place_targets(driver, max_businesses)
            eprint("[scraper] targets collected:", len(targets), json.dumps([t["name"] for t in targets]))

        if not targets:
            eprint("[scraper] no listing URLs found (selectors/DOM mismatch or blocking)")
            return []

        ms = float(min_stars)
        xs = float(max_stars)

        for target in targets:
            if _over_budget(deadline):
                eprint("[scraper] budget exhausted — returning partial niche results")
                break
            try:
                if driver.current_url != target["link"]:
                    driver.get(target["link"])
                    time.sleep(1.2)
                if not open_reviews_tab(driver, timeout=8.0):
                    eprint("[scraper] reviews tab not found for:", target["name"])
                    continue
                time.sleep(0.8)
                rows = extract_review_blocks(
                    driver, reviews_per_business, target["name"], ms, xs
                )
                eprint("[scraper] extracted rows for", target["name"], ":", len(rows))
                all_reviews_data.extend(rows)
            except Exception as ex:
                eprint("[scraper] business loop error:", target.get("name"), ex)
                continue

        out = filter_reviews(all_reviews_data)[:20]  # hard cap: at most 20 reviews per scrape job
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
    deadline = _scrape_budget_deadline()
    try:
        search_query = f"{competitor_name} {location}".strip()
        url = _maps_search_url(search_query, None)
        eprint("[scraper] competitor maps URL:", url)
        driver.get(url)
        time.sleep(1.5)

        dismiss_cookie_consent(driver)

        if "place/" not in driver.current_url:
            try:
                if _over_budget(deadline):
                    return {"business_info": {"name": competitor_name, "website": "N/A", "phone": "N/A", "address": "N/A"}, "reviews": []}
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "div[role='feed'], div[role='article']"))
                )
                scroll_results_feed(driver, rounds=3)
                link_el = WebDriverWait(driver, 8).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "a.hfpxzc, a[href*='/maps/place/']"))
                )
                link_el.click()
                time.sleep(1.8)
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

        if not open_reviews_tab(driver, timeout=6.0):
            eprint("[scraper] competitor reviews tab missing")
            return {"business_info": biz_info, "reviews": []}

        ms = float(min_stars)
        xs = float(max_stars)
        rows = extract_review_blocks(driver, reviews_per_business, biz_info["name"], ms, xs)

        return {"business_info": biz_info, "reviews": filter_reviews(rows)[:20]}  # hard cap: at most 20 reviews per scrape job
    finally:
        driver.quit()
