import asyncio
import logging
import traceback

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Union, List, Any, Dict

from scraper_engine import (
    scrape_all_business_reviews,
    scrape_competitor_reviews,
    get_driver,
    probe_maps_search,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("leadgap.scraper")

app = FastAPI()


class ScrapeRequest(BaseModel):
    query: str
    mode: str = "niche"
    location: Optional[str] = None
    max_businesses: int = 3
    reviews_per_business: int = 10
    min_stars: int = 1
    max_stars: int = 5


@app.get("/")
def health_check():
    return {"status": "alive", "service": "LeadGap Scraper Engine"}


@app.get("/diagnostics")
def diagnostics():
    """Quick Chrome/Chromium smoke test — use after deploy to verify Selenium works."""
    driver = None
    try:
        driver = get_driver()
        driver.get("about:blank")
        return {
            "ok": True,
            "title": driver.title,
            "chrome_bin": driver.capabilities.get("browserName"),
        }
    except Exception as e:
        log.error("diagnostics failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if driver:
            driver.quit()


@app.post("/probe")
async def run_probe(request: ScrapeRequest):
    """Debug Maps search without extracting reviews."""
    try:
        return await asyncio.to_thread(
            probe_maps_search,
            request.query,
            request.location,
        )
    except Exception as e:
        log.error("probe failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scrape")
async def run_scrape(request: ScrapeRequest):
    log.info(
        "scrape start mode=%s query=%s location=%s",
        request.mode,
        request.query,
        request.location,
    )
    try:
        if request.mode == "competitor":
            if not request.location:
                raise HTTPException(status_code=400, detail="Location is required for competitor mode")

            data: Union[List[Any], Dict[str, Any]] = await asyncio.to_thread(
                scrape_competitor_reviews,
                request.query,
                request.location,
                request.reviews_per_business,
                request.min_stars,
                request.max_stars,
            )
        else:
            data = await asyncio.to_thread(
                scrape_all_business_reviews,
                request.query,
                request.location,
                request.max_businesses,
                request.reviews_per_business,
                request.min_stars,
                request.max_stars,
            )

        log.info("scrape done mode=%s payload_type=%s", request.mode, type(data).__name__)
        return data
    except HTTPException:
        raise
    except Exception as e:
        log.error("scrape failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
