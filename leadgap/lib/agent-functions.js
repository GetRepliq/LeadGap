import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_PRIVATE_SERVICE_ROLE;
const SCRAPER_URL = "https://leadgap-ybbg.onrender.com/scrape";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Regional Server Configuration ---
const REGIONAL_BASE_URLS = {
  "us-central1":     "https://us-central1-aiplatform.googleapis.com",
  "us-east4":        "https://us-east4-aiplatform.googleapis.com",
  "europe-west4":    "https://europe-west4-aiplatform.googleapis.com",
  "asia-southeast1": "https://asia-southeast1-aiplatform.googleapis.com",
};

const ALL_REGIONS = [null, ...Object.keys(REGIONAL_BASE_URLS)];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let activeRegion = process.env.GEMINI_REGION || null;
const SHUFFLED_FALLBACKS = shuffleArray(ALL_REGIONS);

function getRegionQueue() {
  return [activeRegion, ...SHUFFLED_FALLBACKS.filter(r => r !== activeRegion)];
}

function buildGenAIForRegion(region, apiKey) {
  if (region) {
    const baseUrl = REGIONAL_BASE_URLS[region];
    return new GoogleGenerativeAI(apiKey, { baseUrl });
  }
  return new GoogleGenerativeAI(apiKey);
}

function is503(error) {
  return (
    error?.message?.includes('503') ||
    error?.message?.includes('Service Unavailable') ||
    error?.message?.includes('high demand')
  );
}

export async function withRegionFallback(apiFn, apiKey) {
  const queue = getRegionQueue();

  for (const region of queue) {
    const regionLabel = region ?? 'global';
    try {
      const genAI = buildGenAIForRegion(region, apiKey);
      const result = await apiFn(genAI);
      if (activeRegion !== region) {
        activeRegion = region;
      }
      return result;
    } catch (error) {
      if (is503(error)) {
        await new Promise(res => setTimeout(res, 600));
        continue;
      }
      throw error;
    }
  }

  throw new Error('All Gemini regions returned 503. Widespread issues detected.');
}

async function synthesizeMarketIntelligence(rawAnalysis, query, apiKey) {
  const prompt = `You are an expert market intelligence analyst. Synthesize this data into a structured JSON cache for a marketing ad copywriter. Query: "${query}". Data: ${JSON.stringify(rawAnalysis)}`;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, apiKey);
    return JSON.parse(llmText);
  } catch (error) {
    return null;
  }
}

export async function analyzeReviews(reviews, apiKey) {
  if (!apiKey) return { error: "API Key missing." };

  const prompt = `Analyze these reviews for marketing insights. Return JSON. Reviews: ${JSON.stringify(reviews)}`;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, apiKey);

    return { rawJson: JSON.parse(llmText) };
  } catch (error) {
    return { error: error.message };
  }
}

export async function updateMemory(rawAnalysis, searchQuery, apiKey) {
  if (!rawAnalysis) return;
  const synthesizedData = await synthesizeMarketIntelligence(rawAnalysis, searchQuery, apiKey);
  if (!synthesizedData) return { error: "Synthesis failed" };

  const { data, error } = await supabase
    .from('market_intelligence')
    .insert([{ query: searchQuery, niche: synthesizedData.project?.niche || null, data: synthesizedData }])
    .select();

  return error ? { error: error.message } : { success: true, data };
}

export async function classifyIntent(command, apiKey) {
  if (!apiKey) return { intent: "error", detail: "API Key missing." };

  const prompt = `You are an intent classification AI. Determine the user's goal from the following command: "${command}"

  Possible intents:
  1. "extract_reviews": User wants to find general reviews for a NICHE or CATEGORY in an area. (e.g., "plumbers in Austin", "best cafes in London").
  2. "competitor_analysis": User wants a deep dive into ONE SPECIFIC BRAND or BUSINESS NAME. (e.g., "Analyze ABC Plumbing", "Reviews for Starbucks in Soho").
  3. "generate_content": User wants to create marketing materials based on research.
  4. "other": General conversation.

  CRITICAL RULE: If the user does not name a specific business, use "extract_reviews". 

  Respond with ONLY a raw JSON object:
  {
    "intent": "extract_reviews" | "competitor_analysis" | "generate_content" | "other",
    "searchQuery": "niche/topic for extract_reviews (else null)",
    "competitorName": "exact name of business for competitor_analysis (else null)",
    "location": "city/area (else null)",
    "contentRequest": "description for generate_content (else null)"
  }
  `;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, apiKey);
    
    const parsed = JSON.parse(llmText);
    // Sanity check: ensure searchQuery is populated for extract_reviews
    if (parsed.intent === 'extract_reviews' && !parsed.searchQuery) {
        parsed.searchQuery = command;
    }
    return parsed;
  } catch (error) {
    return { intent: "error", detail: error.message };
  }
}

export async function analyzeCompetitor(competitorData, apiKey) {
  if (!apiKey) return { error: "API Key missing." };

  const prompt = `Create a competitor battle card JSON. Data: ${JSON.stringify(competitorData)}`;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, apiKey);

    return { card: JSON.parse(llmText), business_info: competitorData.business_info };
  } catch (error) {
    return { error: error.message };
  }
}

export async function generateMarketingContent(request, apiKey) {
  if (!apiKey) return { error: "API Key missing." };

  const { data: cache } = await supabase.from('market_intelligence').select('data').order('created_at', { ascending: false }).limit(1);
  if (!cache?.[0]) return { error: "No research found" };

  const prompt = `Write ad copy using this context: ${JSON.stringify(cache[0].data)}. Request: "${request}"`;

  try {
    const content = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({ model: "models/gemini-flash-latest" });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }, apiKey);
    return { content };
  } catch (error) {
    return { error: error.message };
  }
}

export function formatGeneratedContent(text) {
  return text.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
}

export async function saveChat({ userId, chatId, title, messages }) {
  if (!userId) return null;
  const payload = { messages, updated_at: new Date().toISOString() };
  if (title) payload.title = title;

  const { data, error } = chatId 
    ? await supabase.from('chats').update(payload).eq('id', chatId).eq('user_id', userId).select().single()
    : await supabase.from('chats').insert([{ user_id: userId, title: title || "New Session", messages }]).select().single();

  return error ? null : data;
}

export async function scrapeReviews({ searchQuery, mode = "niche", competitorName, location }) {
  const payload = {
    query: searchQuery || competitorName, // Ensure we have a query
    mode,
    location,
    max_businesses: 3,
    reviews_per_business: 10
  };

  console.log("[agent] Sending payload to Render:", JSON.stringify(payload));

  const scraperMs = Number(process.env.SCRAPER_FETCH_TIMEOUT_MS) || 110000;

  try {
    const response = await fetch(SCRAPER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(scraperMs),
    });

    if (!response.ok) {
      const errBody = await response.text(); // Get raw text if JSON parse fails
      console.error("[agent] Render returned error status:", response.status, "Body:", errBody);
      throw new Error(`Scraper failed (${response.status}): ${errBody}`);
    }

    return await response.json();
  } catch (e) {
    const aborted =
      e?.name === "AbortError" ||
      e?.name === "TimeoutError" ||
      /aborted|timeout/i.test(String(e?.message));
    const msg = aborted
      ? `Scraper request timed out after ${scraperMs}ms (increase SCRAPER_FETCH_TIMEOUT_MS or Vercel maxDuration)`
      : e.message;
    console.error("[agent] Fetch error during scraping:", msg);
    return { error: msg };
  }
}
