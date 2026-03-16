import time
import sys
import json
import argparse
from selenium import webdriver
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, StaleElementReferenceException

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def scrape_all_business_reviews(search_query, max_businesses=5, reviews_per_business=10, min_stars=1, max_stars=5):
    """
    Scrapes Google Maps reviews for multiple businesses from a search query using Selenium.
    This approach is more robust by iterating through businesses, extracting names first,
    and ensuring context for element selection.
    IMPROVED: Now expands truncated reviews to get full text.
    """
    # --- Browser and Driver Setup ---
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    wait = WebDriverWait(driver, 10)

    # --- Start Scraping Process ---
    base_url = "https://www.google.com"
    search_url = f"{base_url}/maps/search/{search_query.replace(' ', '+')}"
    driver.get(search_url)
    eprint(f"Navigated to: {search_url}")

    # --- Handle Cookie Consent ---
    try:
        consent_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button[aria-label='Reject all']")))
        consent_button.click()
        eprint("Clicked 'Reject all' on cookie consent dialog.")
        time.sleep(1)
    except TimeoutException:
        eprint("Cookie consent dialog not found, proceeding...")

    # --- Get all business listings from the sidebar ---
    try:
        eprint("Finding business listings in the sidebar...")
        business_listing_selector = "div[role='article']"
        # Wait for at least one article to be present
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, business_listing_selector)))
        
        # Get all listings
        business_listings = driver.find_elements(By.CSS_SELECTOR, business_listing_selector)
        eprint(f"Found {len(business_listings)} businesses in the sidebar.")
    except TimeoutException:
        eprint("Could not find any business listings. The page structure may have changed.")
        driver.quit()
        return []

    all_reviews_data = []

    # --- Loop through each business ---
    for i in range(min(len(business_listings), max_businesses)):
        try:
            # Re-find the elements in each iteration to avoid stale elements
            # Get the latest list of business articles
            current_business_listings = driver.find_elements(By.CSS_SELECTOR, business_listing_selector)
            if i >= len(current_business_listings):
                eprint(f"Skipping index {i} as it's out of bounds for current listings.")
                continue # Break if the list has shrunk for some reason

            business_to_process_article = current_business_listings[i]

            # --- 1. Extract business name from the sidebar listing FIRST ---
            business_name = business_to_process_article.get_attribute("aria-label")
            if not business_name: # Fallback if aria-label is missing
                try:
                    # Try finding a specific div that might contain the name
                    name_element_sidebar = business_to_process_article.find_element(By.CSS_SELECTOR, "div[aria-label*='Business name']")
                    business_name = name_element_sidebar.get_attribute("aria-label") # Or .text, depending on element
                except NoSuchElementException:
                    pass # If still not found, we'll skip or log it

            if not business_name:
                eprint(f"Skipping business at index {i} due to missing name in sidebar.")
                continue
            
            eprint(f"\n--- Processing Business {i+1}: {business_name} ---")

            # --- 2. Click on the business link to open its details ---
            link_element = business_to_process_article.find_element(By.CSS_SELECTOR, "a.hfpxzc")
            link_element.click()

            # --- 3. Wait for the business detail pane to load and confirm ---
            eprint("Waiting for business details to load and for Reviews tab...")
            # Give the page time to start loading
            time.sleep(3)
            
            # Wait for the detail pane to load
            try:
                # Check if we're on a place page
                for attempt in range(5):
                    current_url = driver.current_url
                    eprint(f"  Current URL (attempt {attempt + 1}): {current_url[:100]}...")
                    
                    if "place" in current_url or "@" in current_url:
                        eprint("  Successfully navigated to business page")
                        break
                    time.sleep(1)
                else:
                    eprint(f"  Warning: URL doesn't contain 'place' or '@': {current_url}")
                
                # Try to find the business name heading
                h1_selectors = ["h1", "h1.DUwDvf", "div.fontHeadlineLarge"]
                business_name_from_page = None
                
                for h1_selector in h1_selectors:
                    try:
                        h1_elements = driver.find_elements(By.CSS_SELECTOR, h1_selector)
                        for h1 in h1_elements:
                            text = h1.text
                            if text and text not in ["Results", "", "Search"]:
                                business_name_from_page = text
                                eprint(f"  Found business name: {business_name_from_page}")
                                break
                        if business_name_from_page:
                            break
                    except NoSuchElementException:
                        continue
                
                if not business_name_from_page:
                    eprint("  Warning: Could not find business name heading, continuing anyway...")
                    
            except Exception as e:
                eprint(f"  Error during page load wait: {e}")
                # Continue anyway and try to find reviews
            
            # Use the business name we found (or fallback to sidebar name)
            current_business_name = business_name_from_page if business_name_from_page else business_name
            eprint(f"Using business name: {current_business_name}")


            # --- 4. Find and Click the "Reviews" Tab ---
            eprint("Finding and clicking the 'Reviews' tab.")
            # Wait a bit for the page to stabilize
            time.sleep(2)
            
            # Try multiple selectors for the Reviews tab
            reviews_tab = None
            reviews_tab_selectors = [
                "//button[@role='tab'][contains(., 'Reviews')]",
                "//button[contains(@aria-label, 'Reviews')]",
                "//button[.//span[contains(text(), 'Reviews')]]",
                "button[aria-label*='Reviews']"
            ]
            
            for selector in reviews_tab_selectors:
                try:
                    by_type = By.XPATH if selector.startswith('//') or selector.startswith('(') else By.CSS_SELECTOR
                    reviews_tab = wait.until(EC.element_to_be_clickable((by_type, selector)))
                    eprint(f"Found Reviews tab using selector: {selector}")
                    break
                except TimeoutException:
                    continue
            
            if not reviews_tab:
                eprint("Could not find Reviews tab. Trying to scroll to find it...")
                raise TimeoutException("Reviews tab not found")
            
            reviews_tab.click()
            time.sleep(2)  # Wait for reviews to load

            # --- 5. Find and Scroll the Correct Scrollable Pane within the Detail Pane ---
            eprint("Scrolling to load reviews...")
            
            # Try multiple selectors for the scrollable reviews pane
            scrollable_pane = None
            scrollable_pane_selectors = [
                "div.m6QErb[role='main']",  # Main content area that often contains reviews
                "div.m6QErb.DxyBCb.kA9KIf.dS8AEf",  # Previous selector
                "div[aria-label*='Reviews']",  # Any div with Reviews in aria-label
                "div.m6QErb",  # More general scrollable container
            ]
            
            for selector in scrollable_pane_selectors:
                try:
                    scrollable_pane = driver.find_element(By.CSS_SELECTOR, selector)
                    # Check if element is scrollable (has overflow)
                    if scrollable_pane:
                        eprint(f"Found scrollable pane using selector: {selector}")
                        break
                except NoSuchElementException:
                    continue
            
            if not scrollable_pane:
                # Last resort: find any scrollable div in the page
                eprint("Using fallback scrollable element")
                scrollable_pane = driver.find_element(By.CSS_SELECTOR, "div.m6QErb")
            
            # Try multiple selectors for review containers
            review_container_selectors = [
                "div.jJc9Ad",  # Original selector
                "div.jftiEf",  # Alternative review container
                "div[data-review-id]",  # Reviews with data attribute
                "div.fontBodyMedium",  # Another common review container class
            ]
            
            review_container_selector = None
            for selector in review_container_selectors:
                if len(driver.find_elements(By.CSS_SELECTOR, selector)) > 0:
                    review_container_selector = selector
                    eprint(f"Using review container selector: {selector}")
                    break
            
            if not review_container_selector:
                eprint(f"Could not find any review containers for {current_business_name}")
                continue
            
            # Scroll until enough reviews are loaded or end is reached
            max_scrolls = 10  # Prevent infinite scrolling
            scroll_attempts = 0
            
            while len(driver.find_elements(By.CSS_SELECTOR, review_container_selector)) < reviews_per_business and scroll_attempts < max_scrolls:
                current_count = len(driver.find_elements(By.CSS_SELECTOR, review_container_selector))
                eprint(f"Found {current_count} reviews so far for {current_business_name}...")
                
                driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scrollable_pane)
                time.sleep(2) # Wait for new reviews to load

                new_count = len(driver.find_elements(By.CSS_SELECTOR, review_container_selector))
                scroll_attempts += 1
                
                if new_count == current_count:
                    eprint("Reached the end of reviews for this business or no new reviews loaded.")
                    break
            
            # --- IMPROVED: Expand truncated reviews first ---
            eprint("Expanding truncated reviews to get full text...")
            more_button_selectors = [
                "button.w8nwRe.kyuRq",  # Common "More" button class
                "button[aria-label='See more']",
                "button[jsaction*='review.expand']",
                "button.fontBodySmall",
                "button[class*='review'][class*='expand']"
            ]
            
            # Find and click all "More" buttons
            expanded_count = 0
            for more_selector in more_button_selectors:
                try:
                    more_buttons = driver.find_elements(By.CSS_SELECTOR, more_selector)
                    for button in more_buttons:
                        try:
                            # Check if button text indicates it's a "More" button
                            button_text = button.text.lower()
                            button_aria = button.get_attribute("aria-label")
                            
                            if "more" in button_text or (button_aria and "more" in button_aria.lower()):
                                # Scroll button into view
                                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
                                time.sleep(0.3)
                                
                                # Try to click using JavaScript if regular click fails
                                try:
                                    button.click()
                                except Exception:
                                    driver.execute_script("arguments[0].click();", button)
                                    
                                expanded_count += 1
                                time.sleep(0.2)  # Small delay between clicks
                        except (StaleElementReferenceException, Exception):
                            # Button might have disappeared or become stale, continue
                            continue
                except NoSuchElementException:
                    continue
            
            eprint(f"Expanded {expanded_count} truncated reviews")
            time.sleep(1)  # Wait for expansions to complete
            
            # --- Extract review details ---
            eprint("Extracting review details...")
            
            # Try multiple selectors for review text and ratings
            review_text_selectors = ["span.wiI7pd", "span.MyEned", "div.MyEned", "span[class*='review-text']"]
            star_rating_selectors = ["span.kvMYJc[role='img']", "span.fzvQIb", "span[aria-label*='star']", "div.fontTitleSmall span[role='img']"]
            
            # Get all review elements currently loaded
            all_review_elements = driver.find_elements(By.CSS_SELECTOR, review_container_selector)
            eprint(f"Attempting to extract from {len(all_review_elements)} review elements...")
            
            for review_element in all_review_elements:
                if len(all_reviews_data) >= (i + 1) * reviews_per_business: # Stop if we've scraped enough total reviews
                    break
                
                # Try to find review text
                review_text = None
                for text_selector in review_text_selectors:
                    try:
                        review_text = review_element.find_element(By.CSS_SELECTOR, text_selector).text
                        if review_text:
                            break
                    except NoSuchElementException:
                        continue
                
                # Try to find star rating
                star_rating = None
                for rating_selector in star_rating_selectors:
                    try:
                        star_rating = review_element.find_element(By.CSS_SELECTOR, rating_selector).get_attribute("aria-label")
                        if star_rating:
                            break
                    except NoSuchElementException:
                        continue
                
                # Only add if we found at least review text
                if review_text:
                    numerical_star_rating = None
                    if star_rating and "stars" in star_rating:
                        try:
                            # Extract numerical part, e.g., "5.0 stars" -> 5.0
                            numerical_star_rating = float(star_rating.split(" ")[0])
                        except ValueError:
                            pass # Handle cases where parsing fails

                    # Filter based on star ratings
                    if numerical_star_rating is not None and \
                       min_stars <= numerical_star_rating <= max_stars:
                        all_reviews_data.append({
                            "business_name": current_business_name,
                            "stars": star_rating, # Keep original string for display
                            "numerical_stars": numerical_star_rating, # Add numerical value
                            "text": review_text
                        })
                    # Show more of the review text in the log to verify we got the full text
                    eprint(f"  Extracted review {len(all_reviews_data)}: {review_text[:100]}...")

            # --- Navigate back to search results to process the next business ---
            eprint("Navigating back to search results to process next business...")
            driver.get(search_url)
            # Important: Wait for the listings to reappear before the next loop iteration
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, business_listing_selector)))
            time.sleep(2) # Extra sleep to ensure stability after returning

        except (TimeoutException, StaleElementReferenceException, NoSuchElementException) as e:
            eprint(f"Could not process business at index {i}. Error: {e}")
            eprint("This might be due to the business listing structure or dynamic page updates.")
            # Attempt to navigate back to search results to recover for the next iteration
            driver.get(search_url)
            try:
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, business_listing_selector)))
                time.sleep(2)
            except TimeoutException:
                eprint("Failed to return to search results page. Aborting further processing.")
                break # Exit loop if we can't recover

    driver.quit()
    eprint("\nScraping process finished and browser closed.")
    filtered_reviews = filter_reviews(all_reviews_data[:(max_businesses * reviews_per_business)])
    return filtered_reviews

def filter_reviews(reviews, min_word_count=5):
    """
    Filters a list of review dictionaries to remove duplicates and low-signal reviews.
    """
    eprint(f"Starting review filtering. Initial count: {len(reviews)}")
    
    unique_reviews = []
    seen_texts = set()

    for review in reviews:
        review_text = review.get("text")
        if not review_text:
            continue

        # --- Remove Duplicates ---
        # Using a simple hash of the text for duplicate detection
        if review_text in seen_texts:
            eprint(f"  Skipping duplicate review: {review_text[:50]}...")
            continue
        seen_texts.add(review_text)

        # --- Remove Low-Signal Reviews ---
        word_count = len(review_text.split())
        if word_count < min_word_count:
            eprint(f"  Skipping low-signal review (word count: {word_count}): {review_text[:50]}...")
            continue
        
        unique_reviews.append(review)
    
    eprint(f"Filtering complete. Filtered count: {len(unique_reviews)}")
    return unique_reviews



def scrape_competitor_reviews(competitor_name, location, reviews_per_business=20, min_stars=1, max_stars=5):
    """
    Surgically scrapes reviews for a SPECIFIC competitor.
    Handles direct hits (where Google Maps jumps straight to the business page).
    """
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    wait = WebDriverWait(driver, 10)

    search_query = f"{competitor_name} in {location}"
    search_url = f"https://www.google.com/maps/search/{search_query.replace(' ', '+')}"
    driver.get(search_url)
    eprint(f"Surgical search initiated for: {search_query}")

    # --- Handle Cookie Consent ---
    try:
        consent_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button[aria-label='Reject all']")))
        consent_button.click()
        time.sleep(1)
    except TimeoutException:
        pass

    # --- Check for Direct Hit vs. List ---
    # If the URL contains "place/" it means we landed directly on the business page
    time.sleep(3)
    current_url = driver.current_url
    
    if "place/" not in current_url:
        eprint("Multiple results or search list found. Picking the first match...")
        try:
            first_result_selector = "a.hfpxzc"
            wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, first_result_selector)))
            driver.find_element(By.CSS_SELECTOR, first_result_selector).click()
            time.sleep(3)
        except Exception as e:
            eprint(f"Error picking first result: {e}")
            driver.quit()
            return []

    # --- Now on business page ---
    try:
        # Extract name to verify
        h1_selectors = ["h1", "h1.DUwDvf", "div.fontHeadlineLarge"]
        found_name = "Unknown"
        for selector in h1_selectors:
            try:
                found_name = driver.find_element(By.CSS_SELECTOR, selector).text
                if found_name: break
            except: continue
        eprint(f"Targeting Business: {found_name}")

        # --- Extract Business Info ---
        business_info = {
            "name": found_name,
            "website": "N/A",
            "phone": "N/A",
            "address": "N/A"
        }
        
        try:
            # Website
            web_el = driver.find_elements(By.CSS_SELECTOR, "a[aria-label^='Website:']")
            if web_el: business_info["website"] = web_el[0].get_attribute("href")
            
            # Phone
            phone_el = driver.find_elements(By.CSS_SELECTOR, "button[data-item-id^='phone:tel:']")
            if phone_el: business_info["phone"] = phone_el[0].get_attribute("data-item-id").replace("phone:tel:", "")
            
            # Address
            addr_el = driver.find_elements(By.CSS_SELECTOR, "button[data-item-id^='address']")
            if addr_el: business_info["address"] = addr_el[0].get_attribute("aria-label").replace("Address: ", "")
        except: pass

        # --- Find and Click the "Reviews" Tab ---
        reviews_tab = None
        reviews_tab_selectors = [
            "//button[@role='tab'][contains(., 'Reviews')]",
            "//button[contains(@aria-label, 'Reviews')]",
            "button[aria-label*='Reviews']"
        ]
        
        for selector in reviews_tab_selectors:
            try:
                by_type = By.XPATH if selector.startswith('//') else By.CSS_SELECTOR
                reviews_tab = wait.until(EC.element_to_be_clickable((by_type, selector)))
                break
            except: continue
        
        if not reviews_tab:
            eprint("Reviews tab not found.")
            driver.quit()
            return []
        
        reviews_tab.click()
        time.sleep(2)

        # --- Find Scrollable Pane ---
        scrollable_pane = None
        for selector in ["div.m6QErb[role='main']", "div.m6QErb.DxyBCb.kA9KIf.dS8AEf", "div.m6QErb"]:
            try:
                scrollable_pane = driver.find_element(By.CSS_SELECTOR, selector)
                if scrollable_pane: break
            except: continue

        # --- Scroll and Load ---
        review_container_selector = "div.jJc9Ad" # Common container
        max_scrolls = 15
        scroll_attempts = 0
        
        while len(driver.find_elements(By.CSS_SELECTOR, review_container_selector)) < reviews_per_business and scroll_attempts < max_scrolls:
            driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", scrollable_pane)
            time.sleep(2)
            scroll_attempts += 1
        
        # --- Expand "More" ---
        more_buttons = driver.find_elements(By.CSS_SELECTOR, "button.w8nwRe.kyuRq")
        for btn in more_buttons:
            try:
                driver.execute_script("arguments[0].click();", btn)
            except: pass
        time.sleep(1)

        # --- Extract ---
        all_reviews = []
        review_elements = driver.find_elements(By.CSS_SELECTOR, review_container_selector)
        
        for el in review_elements:
            try:
                text = el.find_element(By.CSS_SELECTOR, "span.wiI7pd").text
                star_aria = el.find_element(By.CSS_SELECTOR, "span.kvMYJc").get_attribute("aria-label")
                stars = float(star_aria.split(" ")[0]) if star_aria else 0
                
                if text and min_stars <= stars <= max_stars:
                    all_reviews.append({
                        "business_name": found_name,
                        "stars": star_aria,
                        "numerical_stars": stars,
                        "text": text
                    })
            except: continue

        driver.quit()
        return {
            "business_info": business_info,
            "reviews": filter_reviews(all_reviews)
        }

    except Exception as e:
        eprint(f"Error during surgical extraction: {e}")
        driver.quit()
        return {"business_info": {}, "reviews": []}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Scrape Google Maps reviews.")
    parser.add_argument("query", nargs="?", help="Search query or competitor name.")
    parser.add_argument("--mode", default="niche", choices=["niche", "competitor"], help="Scraping mode.")
    parser.add_argument("--location", help="Location for competitor search.")
    parser.add_argument("--max_businesses", type=int, default=3)
    parser.add_argument("--reviews_per_business", type=int, default=10)
    parser.add_argument("--min_stars", type=int, default=1)
    parser.add_argument("--max_stars", type=int, default=5)
    args = parser.parse_args()

    if args.mode == "competitor":
        if not args.query or not args.location:
            eprint("Error: Competitor name (query) and --location are required for competitor mode.")
            sys.exit(1)
        scraped_data = scrape_competitor_reviews(
            args.query,
            args.location,
            reviews_per_business=args.reviews_per_business,
            min_stars=args.min_stars,
            max_stars=args.max_stars
        )
    else:
        scraped_data = scrape_all_business_reviews(
            args.query,
            max_businesses=args.max_businesses,
            reviews_per_business=args.reviews_per_business,
            min_stars=args.min_stars,
            max_stars=args.max_stars
        )
    
    print(json.dumps(scraped_data, indent=2))
