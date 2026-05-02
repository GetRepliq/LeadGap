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
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
    
    # In Docker/Render, Chrome is usually at /usr/bin/google-chrome
    # and we install the matching driver.
    return webdriver.Chrome(options=chrome_options)

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

def scrape_all_business_reviews(search_query, max_businesses=5, reviews_per_business=10, min_stars=1, max_stars=5):
    driver = get_driver()
    wait = WebDriverWait(driver, 15)
    
    try:
        search_url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"
        driver.get(search_url)

        # Handle Cookie Consent
        try:
            consent_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button[aria-label='Reject all']")))
            consent_button.click()
        except: pass

        # Get listings
        business_listing_selector = "div[role='article']"
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, business_listing_selector)))
        business_listings = driver.find_elements(By.CSS_SELECTOR, business_listing_selector)

        all_reviews_data = []

        for i in range(min(len(business_listings), max_businesses)):
            try:
                # Re-find to avoid stale elements
                current_listings = driver.find_elements(By.CSS_SELECTOR, business_listing_selector)
                if i >= len(current_listings): break
                
                biz_article = current_listings[i]
                biz_name = biz_article.get_attribute("aria-label")
                
                link = biz_article.find_element(By.CSS_SELECTOR, "a.hfpxzc")
                link.click()
                time.sleep(3)

                # Find Reviews Tab
                reviews_tab_selectors = ["//button[@role='tab'][contains(., 'Reviews')]", "button[aria-label*='Reviews']"]
                reviews_tab = None
                for selector in reviews_tab_selectors:
                    try:
                        by = By.XPATH if selector.startswith('/') else By.CSS_SELECTOR
                        reviews_tab = wait.until(EC.element_to_be_clickable((by, selector)))
                        break
                    except: continue
                
                if not reviews_tab: continue
                reviews_tab.click()
                time.sleep(2)

                # Scroll and Extract (Simplified for cloud reliability)
                scrollable_pane = driver.find_element(By.CSS_SELECTOR, "div.m6QErb.DxyBCb.kA9KIf.dS8AEf")
                for _ in range(3): # Scroll a few times
                    driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scrollable_pane)
                    time.sleep(2)

                review_elements = driver.find_elements(By.CSS_SELECTOR, "div.jJc9Ad")
                for el in review_elements:
                    try:
                        text = el.find_element(By.CSS_SELECTOR, "span.wiI7pd").text
                        star_aria = el.find_element(By.CSS_SELECTOR, "span.kvMYJc").get_attribute("aria-label")
                        stars = float(star_aria.split(" ")[0]) if star_aria else 0
                        if text and min_stars <= stars <= max_stars:
                            all_reviews_data.append({"business_name": biz_name, "stars": star_aria, "text": text})
                    except: continue

                driver.get(search_url)
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, business_listing_selector)))
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

        # Handle direct hit vs list
        if "place/" not in driver.current_url:
            try:
                driver.find_element(By.CSS_SELECTOR, "a.hfpxzc").click()
                time.sleep(3)
            except: pass

        # Extract Info
        biz_info = {"name": competitor_name, "website": "N/A", "phone": "N/A", "address": "N/A"}
        try:
            h1 = driver.find_element(By.CSS_SELECTOR, "h1").text
            if h1: biz_info["name"] = h1
            web = driver.find_elements(By.CSS_SELECTOR, "a[aria-label^='Website:']")
            if web: biz_info["website"] = web[0].get_attribute("href")
        except: pass

        # Click Reviews
        try:
            driver.find_element(By.XPATH, "//button[@role='tab'][contains(., 'Reviews')]").click()
            time.sleep(2)
        except: return {"business_info": biz_info, "reviews": []}

        # Extract
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
