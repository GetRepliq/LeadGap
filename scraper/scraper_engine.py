import time
import sys
import json
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def get_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--disable-extensions")
    chrome_options.add_argument("--blink-settings=imagesEnabled=false") # Speed up by disabling images
    chrome_options.binary_location = "/usr/bin/chromium"
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
    
    service = Service(executable_path="/usr/bin/chromedriver")
    return webdriver.Chrome(service=service, options=chrome_options)

def filter_reviews(reviews, min_word_count=5):
    unique_reviews = []
    seen_texts = set()
    for review in reviews:
        review_text = review.get("text")
        if not review_text or review_text in seen_texts: continue
        if len(review_text.split()) < min_word_count: continue
        seen_texts.add(review_text)
        unique_reviews.append(review)
    return unique_reviews

def scrape_all_business_reviews(search_query, max_businesses=3, reviews_per_business=10, min_stars=1, max_stars=5):
    driver = get_driver()
    wait = WebDriverWait(driver, 15)
    all_reviews_data = []
    
    try:
        search_url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"
        driver.get(search_url)

        # Handle Cookie Consent
        try:
            consent_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button[aria-label='Reject all']")))
            consent_button.click()
            time.sleep(1)
        except: pass

        # 1. Direct-Hit Optimization: Collect all target URLs first
        business_listing_selector = "a.hfpxzc"
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, business_listing_selector)))
        
        listings = driver.find_elements(By.CSS_SELECTOR, "div[role='article']")
        targets = []
        for biz in listings[:max_businesses]:
            try:
                name = biz.get_attribute("aria-label")
                link = biz.find_element(By.CSS_SELECTOR, "a.hfpxzc").get_attribute("href")
                if name and link:
                    targets.append({"name": name, "link": link})
            except: continue

        # 2. Visit each business directly (skips re-loading search results)
        for target in targets:
            try:
                driver.get(target["link"])
                time.sleep(2)

                # Find Reviews Tab
                reviews_tab = None
                selectors = ["//button[@role='tab'][contains(., 'Reviews')]", "button[aria-label*='Reviews']"]
                for s in selectors:
                    try:
                        by = By.XPATH if s.startswith('/') else By.CSS_SELECTOR
                        reviews_tab = wait.until(EC.element_to_be_clickable((by, s)))
                        break
                    except: continue
                
                if not reviews_tab: continue
                reviews_tab.click()
                time.sleep(2)

                # Extract reviews (Limited scroll to respect Render timeout)
                review_elements = driver.find_elements(By.CSS_SELECTOR, "div.jJc9Ad")
                for el in review_elements[:reviews_per_business]:
                    try:
                        text = el.find_element(By.CSS_SELECTOR, "span.wiI7pd").text
                        star_aria = el.find_element(By.CSS_SELECTOR, "span.kvMYJc").get_attribute("aria-label")
                        stars = float(star_aria.split(" ")[0]) if star_aria else 0
                        if text and min_stars <= stars <= max_stars:
                            all_reviews_data.append({"business_name": target["name"], "stars": star_aria, "text": text})
                    except: continue
            except: continue

        return filter_reviews(all_reviews_data)
    finally:
        driver.quit()

def scrape_competitor_reviews(competitor_name, location, reviews_per_business=20, min_stars=1, max_stars=5):
    driver = get_driver()
    wait = WebDriverWait(driver, 15)
    try:
        search_query = f"{competitor_name} in {location}"
        driver.get(f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}")
        time.sleep(4)

        if "place/" not in driver.current_url:
            try:
                driver.find_element(By.CSS_SELECTOR, "a.hfpxzc").click()
                time.sleep(3)
            except: pass

        biz_info = {"name": competitor_name, "website": "N/A", "phone": "N/A", "address": "N/A"}
        try:
            h1 = driver.find_element(By.CSS_SELECTOR, "h1").text
            if h1: biz_info["name"] = h1
            web = driver.find_elements(By.CSS_SELECTOR, "a[aria-label^='Website:']")
            if web: biz_info["website"] = web[0].get_attribute("href")
        except: pass

        try:
            driver.find_element(By.XPATH, "//button[@role='tab'][contains(., 'Reviews')]").click()
            time.sleep(2)
        except: return {"business_info": biz_info, "reviews": []}

        all_reviews = []
        review_els = driver.find_elements(By.CSS_SELECTOR, "div.jJc9Ad")
        for el in review_els:
            try:
                text = el.find_element(By.CSS_SELECTOR, "span.wiI7pd").text
                star_aria = el.find_element(By.CSS_SELECTOR, "span.kvMYJc").get_attribute("aria-label")
                stars = float(star_aria.split(" ")[0]) if star_aria else 0
                if text and min_stars <= stars <= max_stars:
                    all_reviews.append({"business_name": biz_info["name"], "stars": star_aria, "text": text})
            except: continue

        return {"business_info": biz_info, "reviews": filter_reviews(all_reviews)}
    finally:
        driver.quit()
