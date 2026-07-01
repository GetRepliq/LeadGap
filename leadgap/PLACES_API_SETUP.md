# Google Places API setup

LeadGap fetches reviews via **Places API (New)** — not the Render Selenium scraper.

## 1) Enable APIs in Google Cloud

In [Google Cloud Console](https://console.cloud.google.com/) for your project:

1. Enable **Places API (New)**  
   (API name: `places.googleapis.com`)
2. Ensure billing is enabled on the project.

## 2) Add the API key to Vercel

**Vercel → your project → Settings → Environment Variables**

| Name | Value |
|------|--------|
| `GOOGLE_PLACES_API_KEY` | Your Google API key |

Apply to **Production** (and Preview/Development if you use those).

Redeploy after saving.

Alternative env name also supported: `GOOGLE_MAPS_API_KEY`.

## 3) Key restrictions (recommended)

In Google Cloud → APIs & Services → Credentials → your key:

- **API restrictions:** restrict to **Places API (New)** only  
- Do **not** expose this key in the browser — it is only read server-side in `/api/*` routes.

## 4) Local development

Create `leadgap/.env.local`:

```env
GOOGLE_PLACES_API_KEY=your_key_here
GEMINI_API_KEY=your_gemini_key
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_PRIVATE_SERVICE_ROLE=...
```

## 5) Limits

Places API returns up to **5 reviews per business**. Niche searches fetch **2 businesses** (~10 reviews max), which is enough for Gemini analysis.

## 6) Render scraper

The `scraper/` service is **no longer used** by the app. You can leave it running or remove it from Render to save cost.
