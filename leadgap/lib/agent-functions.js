import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';
import { fetchReviewsFromPlaces } from "./places-api";

// --- Configuration ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_PRIVATE_SERVICE_ROLE;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

function is503(error) {
  return (
    error?.message?.includes("503") ||
    error?.message?.includes("Service Unavailable") ||
    error?.message?.includes("high demand")
  );
}

/** Google AI Studio API keys must use the global Generative Language API — not Vertex regional URLs. */
export async function withRegionFallback(apiFn, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    return await apiFn(genAI);
  } catch (error) {
    if (is503(error)) {
      await new Promise((res) => setTimeout(res, 800));
      return await apiFn(genAI);
    }
    throw error;
  }
}

async function synthesizeMarketIntelligence(rawAnalysis, query, apiKey) {
  const prompt = `You are an expert market intelligence analyst. Synthesize this data into a structured JSON cache for a marketing ad copywriter. Query: "${query}". Data: ${JSON.stringify(rawAnalysis)}`;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: DEFAULT_GEMINI_MODEL,
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
        model: DEFAULT_GEMINI_MODEL,
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
        model: DEFAULT_GEMINI_MODEL,
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
    const message = error?.message || "Intent classification failed.";
    if (message.includes("API_KEY_INVALID") || message.includes("API key not valid")) {
      return {
        intent: "error",
        detail:
          "Your Gemini API key was rejected by Google. Re-enter it via Terminal Activation (use a key from Google AI Studio, not Google Cloud/Vertex).",
      };
    }
    return { intent: "error", detail: message };
  }
}

export async function analyzeCompetitor(competitorData, apiKey) {
  if (!apiKey) return { error: "API Key missing." };

  const prompt = `Create a competitor battle card JSON. Data: ${JSON.stringify(competitorData)}`;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: DEFAULT_GEMINI_MODEL,
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
      const model = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });
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
  if (!userId || userId === "undefined") return null;
  const payload = { messages, updated_at: new Date().toISOString() };
  if (title) payload.title = title;

  const { data, error } = chatId 
    ? await supabase.from('chats').update(payload).eq('id', chatId).eq('user_id', userId).select().single()
    : await supabase.from('chats').insert([{ user_id: userId, title: title || "New Session", messages }]).select().single();

  return error ? null : data;
}

export async function scrapeReviews({ searchQuery, mode = "niche", competitorName, location }) {
  return fetchReviewsFromPlaces({
    searchQuery,
    mode,
    competitorName,
    location,
  });
}
