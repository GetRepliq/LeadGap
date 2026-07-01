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


def safe_get(driver, url: str, wait_after: float = 1.0) -> bool:
    """Navigate without failing the whole scrape on renderer timeouts."""
    try:
        driver.set_page_load_timeout(int(os.environ.get("PAGE_LOAD_TIMEOUT_SEC", "45")))
        driver.get(url)
        time.sleep(wait_after)
        return True
    except TimeoutException:
        eprint("[scraper] page load timeout (continuing):", url[:140])
        try:
            driver.execute_script("window.stop();")
        except Exception:
            pass
        time.sleep(wait_after)
        return False


def place_name_from_url(url: str) -> str:
    import re
    from urllib.parse import unquote

    match = re.search(r"/place/([^/@?]+)", url)
    if not match:
        return ""
    return unquote(match.group(1).replace("+", " ")).strip()


def wait_for_place_panel(driver, timeout: float = 12.0) -> str:
    deadline = time.monotonic() + timeout
    invalid_names = {"results", "google maps", ""}

    while time.monotonic() < deadline:
        for css in ("h1.DUwDvf", "h1.fontHeadlineLarge", "h1"):
            try:
                for h1 in driver.find_elements(By.CSS_SELECTOR, css):
                    text = (h1.text or "").strip()
                    if text.lower() not in invalid_names:
                        return text
            except Exception:
                continue
        time.sleep(0.4)

    return place_name_from_url(driver.current_url)


def open_place_by_index(driver, index: int) -> Optional[str]:
    """Open a Maps listing by clicking the search-result card (SPA-friendly)."""
    articles = driver.find_elements(By.CSS_SELECTOR, "div[role='article']")
    if index >= len(articles):
        return None

    article = articles[index]
    name = (article.get_attribute("aria-label") or "").strip()

    for css in _listing_link_selectors():
        try:
            link_el = article.find_element(By.CSS_SELECTOR, css)
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", link_el)
            time.sleep(0.35)
            link_el.click()
            time.sleep(2.0)
            return name or wait_for_place_panel(driver) or None
        except Exception:
            continue
    return None


def load_search_results(driver, search_query: str, location: Optional[str]) -> bool:
    url = _maps_search_url(search_query, location)
    eprint("[scraper] niche maps URL:", url)
    safe_get(driver, url, wait_after=1.0)
    dismiss_cookie_consent(driver)

    blocked = _page_block_reason(driver)
    if blocked:
        eprint("[scraper] maps blocked:", blocked, "url:", driver.current_url)
        return False

    if "/maps/place/" in driver.current_url:
        return True

    for css in ("div[role='feed']", "div[role='article']"):
        try:
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, css))
            )
            time.sleep(0.6)
            return True
        except TimeoutException:
            continue

    reason = _page_block_reason(driver) or "results_feed_timeout"
    eprint("[scraper] timeout waiting for results feed/articles:", reason)
    return False


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


def scroll_reviews_panel(driver, rounds: int = 6) -> None:
    selectors = (
        "div[role='main'] div.m6QErb.DxyBCb",
        "div[role='main'] div.m6QErb",
        "div[role='main'] div[tabindex='-1']",
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
                time.sleep(0.45)
            return
        except Exception:
            continue


REVIEW_BLOCK_SELECTORS = (
    "div.jftiEf",
    "div.jJc9Ad",
    "div.g88MCb",
    "div.UfnAi",
    "[data-review-id]",
)


def wait_for_review_elements(driver, timeout: float = 18.0) -> bool:
    def _any_reviews_present(drv) -> bool:
        for css in REVIEW_BLOCK_SELECTORS + ("span.wiI7pd", "div.wiI7pd", "div.MyEned"):
            if drv.find_elements(By.CSS_SELECTOR, css):
                return True
        return False

    try:
        WebDriverWait(driver, timeout).until(_any_reviews_present)
        return True
    except TimeoutException:
        return False


def expand_reviews_list(driver) -> bool:
    xpaths = (
        "//button[contains(., 'More reviews')]",
        "//span[contains(., 'More reviews')]",
        "//button[contains(@aria-label, 'More reviews')]",
        "//a[contains(@href, 'reviews')]",
    )
    for xpath in xpaths:
        try:
            btn = WebDriverWait(driver, 2).until(
                EC.element_to_be_clickable((By.XPATH, xpath))
            )
            btn.click()
            time.sleep(1.5)
            return True
        except Exception:
            continue
    return False


def extract_reviews_js(driver, limit: int, business_name: str) -> List[dict]:
    script = """
    const limit = arguments[0];
    const businessName = arguments[1] || 'unknown';
    const seen = new Set();
    const out = [];

    const cardSelectors = [
      'div[data-review-id]',
      'div.jftiEf',
      'div.jJc9Ad',
      'div.g88MCb',
      'div.UfnAi',
    ];
    const textSelectors = [
      'span.wiI7pd',
      'div.wiI7pd',
      'div.MyEned span',
      'div.MyEned',
    ];

    function addRow(text, stars) {
      const t = (text || '').replace(/\\s+/g, ' ').trim();
      if (t.length < 12 || seen.has(t)) return;
      seen.add(t);
      out.push({ business_name: businessName, stars: stars || 'unknown', text: t });
    }

    for (const cardSel of cardSelectors) {
      for (const card of document.querySelectorAll(cardSel)) {
        if (out.length >= limit) return out;
        let text = '';
        for (const ts of textSelectors) {
          const el = card.querySelector(ts);
          if (el && el.innerText) { text = el.innerText; break; }
        }
        if (!text) continue;
        let stars = 'unknown';
        const starEl = card.querySelector('[aria-label*="star" i], [aria-label*="Star"]');
        if (starEl) stars = starEl.getAttribute('aria-label') || stars;
        addRow(text, stars);
      }
    }

    const main = document.querySelector('div[role="main"]');
    if (main && out.length < limit) {
      for (const el of main.querySelectorAll('span.wiI7pd, div.wiI7pd, div.MyEned')) {
        addRow(el.innerText, 'unknown');
        if (out.length >= limit) break;
      }
    }
    return out;
    """
    try:
        raw = driver.execute_script(script, limit, business_name)
        return raw if isinstance(raw, list) else []
    except Exception as ex:
        eprint("[scraper] JS review extraction failed:", ex)
        return []


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


def open_reviews_tab(driver, timeout: float = 10.0) -> bool:
    xpath = (
        "//button[@role='tab' and contains(@aria-label, 'Reviews')] | "
        "//button[@role='tab' and contains(., 'Reviews')] | "
        "//div[@role='tab' and contains(., 'Reviews')] | "
        "//button[contains(@aria-label, 'reviews')]"
    )
    try:
        tab = WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((By.XPATH, xpath))
        )
        tab.click()
        time.sleep(1.5)
        expand_reviews_list(driver)
        wait_for_review_elements(driver, timeout=12.0)
        scroll_reviews_panel(driver)
        time.sleep(0.8)
        return True
    except Exception:
        return False


def extract_overview_reviews(driver, limit: int, business_name: str) -> List[dict]:
    """Some listings show review snippets on the Overview tab before Reviews is opened."""
    rows = extract_reviews_js(driver, limit, business_name)
    if rows:
        eprint("[scraper] overview/js preview reviews:", len(rows))
    return rows


def extract_review_blocks(driver, reviews_per_business: int, target_name: str, min_stars: float, max_stars: float) -> List[dict]:
    rows: List[dict] = []
    review_elements: List[Any] = []
    for css in REVIEW_BLOCK_SELECTORS:
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

    if not rows:
        js_rows = extract_reviews_js(driver, reviews_per_business, target_name)
        eprint("[scraper] JS fallback reviews:", len(js_rows))
        for item in js_rows:
            stars = _parse_star_value(str(item.get("stars", "")))
            if stars is None or (min_stars <= stars <= max_stars):
                rows.append(item)
            if len(rows) >= reviews_per_business:
                break

    return rows[:reviews_per_business]


def probe_place_reviews(search_query: str, location: Optional[str] = None) -> Dict[str, Any]:
    """Open first search result and report review DOM state."""
    driver = get_driver()
    try:
        if not load_search_results(driver, search_query, location):
            return {"ok": False, "stage": "search_load_failed"}

        opened_via = "direct_place"
        place_name = ""
        if "/maps/place/" in driver.current_url:
            place_name = wait_for_place_panel(driver)
        else:
            opened_via = "click_index_0"
            clicked_name = open_place_by_index(driver, 0)
            place_name = wait_for_place_panel(driver) or clicked_name or ""

        overview_rows = extract_overview_reviews(driver, 3, place_name or "unknown")
        reviews_tab_open = open_reviews_tab(driver, timeout=12.0)
        reviews_loaded = wait_for_review_elements(driver, timeout=8.0)

        block_counts = {}
        for css in REVIEW_BLOCK_SELECTORS + ("span.wiI7pd", "div.wiI7pd", "div.MyEned", "div.g88MCb"):
            block_counts[css] = len(driver.find_elements(By.CSS_SELECTOR, css))

        sample_rows = extract_review_blocks(driver, 3, place_name or "unknown", 1.0, 5.0)
        if not sample_rows and overview_rows:
            sample_rows = overview_rows

        text_hit_count = 0
        try:
            text_hit_count = driver.execute_script(
                """
                const main = document.querySelector('div[role="main"]');
                if (!main) return 0;
                let n = 0;
                for (const el of main.querySelectorAll('span, div')) {
                  const t = (el.innerText || '').trim();
                  if (t.length >= 30 && t.length <= 1500) n++;
                }
                return n;
                """
            ) or 0
        except Exception:
            text_hit_count = 0

        return {
            "ok": True,
            "opened_via": opened_via,
            "place_name": place_name,
            "current_url": driver.current_url,
            "reviews_tab_open": reviews_tab_open,
            "reviews_loaded": reviews_loaded,
            "block_counts": block_counts,
            "overview_reviews": overview_rows,
            "sample_reviews": sample_rows,
            "text_hit_count": text_hit_count,
        }
    finally:
        driver.quit()


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
    ms = float(min_stars)
    xs = float(max_stars)

    try:
        if not load_search_results(driver, search_query, location):
            return []

        if "/maps/place/" in driver.current_url:
            place_name = wait_for_place_panel(driver) or "unknown"
            overview_rows = extract_overview_reviews(driver, reviews_per_business, place_name)
            if overview_rows:
                all_reviews_data.extend(overview_rows)
            if len(overview_rows) < reviews_per_business and open_reviews_tab(driver, timeout=12.0):
                rows = extract_review_blocks(driver, reviews_per_business, place_name, ms, xs)
                eprint("[scraper] extracted rows for", place_name, ":", len(rows))
                all_reviews_data.extend(rows)
        else:
            for index in range(max_businesses):
                if _over_budget(deadline):
                    eprint("[scraper] budget exhausted — returning partial niche results")
                    break

                if index > 0:
                    if not load_search_results(driver, search_query, location):
                        break
                    scroll_results_feed(driver)

                clicked_name = open_place_by_index(driver, index)
                if not clicked_name:
                    eprint("[scraper] could not open listing at index", index)
                    break

                place_name = wait_for_place_panel(driver) or clicked_name
                try:
                    overview_rows = extract_overview_reviews(driver, reviews_per_business, place_name)
                    if overview_rows:
                        all_reviews_data.extend(overview_rows)
                        eprint("[scraper] overview reviews for", place_name, ":", len(overview_rows))
                    if len(overview_rows) >= reviews_per_business:
                        continue

                    if not open_reviews_tab(driver, timeout=12.0):
                        eprint("[scraper] reviews tab not found for:", place_name)
                        continue
                    time.sleep(0.6)
                    rows = extract_review_blocks(
                        driver, reviews_per_business, place_name, ms, xs
                    )
                    eprint("[scraper] extracted rows for", place_name, ":", len(rows))
                    all_reviews_data.extend(rows)
                except Exception as ex:
                    eprint("[scraper] business loop error:", place_name, ex)
                    continue

        out = filter_reviews(all_reviews_data)[:20]
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
        if not load_search_results(driver, search_query, None):
            return {"business_info": {"name": competitor_name, "website": "N/A", "phone": "N/A", "address": "N/A"}, "reviews": []}

        if "place/" not in driver.current_url:
            try:
                if _over_budget(deadline):
                    return {"business_info": {"name": competitor_name, "website": "N/A", "phone": "N/A", "address": "N/A"}, "reviews": []}
                scroll_results_feed(driver, rounds=3)
                if not open_place_by_index(driver, 0):
                    raise TimeoutException("no listing to click")
                time.sleep(1.0)
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
