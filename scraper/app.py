from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
from scraper_engine import scrape_all_business_reviews, scrape_competitor_reviews

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

@app.post("/scrape")
async def run_scrape(request: ScrapeRequest):
    try:
        if request.mode == "competitor":
            if not request.location:
                raise HTTPException(status_code=400, detail="Location is required for competitor mode")
            
            data = scrape_competitor_reviews(
                request.query, 
                request.location, 
                reviews_per_business=request.reviews_per_business,
                min_stars=request.min_stars,
                max_stars=request.max_stars
            )
        else:
            data = scrape_all_business_reviews(
                request.query, 
                max_businesses=request.max_businesses,
                reviews_per_business=request.reviews_per_business,
                min_stars=request.min_stars,
                max_stars=request.max_stars
            )
        
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
