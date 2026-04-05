import {
  GoogleGenerativeAI
} from "@google/generative-ai";
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// --- Gemini API Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

function buildGenAIForRegion(region) {
  if (region) {
    const baseUrl = REGIONAL_BASE_URLS[region];
    console.log(`[agent] Routing to regional endpoint: ${baseUrl} (${region})`);
    return new GoogleGenerativeAI(GEMINI_API_KEY, { baseUrl });
  }
  console.log(`[agent] Routing to global endpoint.`);
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

function is503(error) {
  return (
    error?.message?.includes('503') ||
    error?.message?.includes('Service Unavailable') ||
    error?.message?.includes('high demand')
  );
}

export async function withRegionFallback(apiFn) {
  const queue = getRegionQueue();

  for (const region of queue) {
    const regionLabel = region ?? 'global';
    try {
      const genAI = buildGenAIForRegion(region);
      const result = await apiFn(genAI);
      if (activeRegion !== region) {
        console.log(`[agent] Region "${regionLabel}" succeeded — pinning for this session.`);
        activeRegion = region;
      }
      return result;
    } catch (error) {
      if (is503(error)) {
        console.warn(`[agent] Region "${regionLabel}" returned 503 — trying next region...`);
        await new Promise(res => setTimeout(res, 600));
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    '[agent] All regions returned 503. Gemini is experiencing widespread issues. Please try again later.'
  );
}

export async function analyzeReviews(reviews) {
  if (!GEMINI_API_KEY) {
    return { error: "GEMINI_API_KEY not found." };
  }
  if (!reviews || reviews.length === 0) {
    return { error: "No reviews were provided to analyze." };
  }

  const reviewsByBusiness = reviews.reduce((acc, review) => {
    const businessName = review.business_name || 'Unknown Business';
    if (!acc[businessName]) {
      acc[businessName] = [];
    }
    acc[businessName].push(review);
    return acc;
  }, {});

  const businessNames = Object.keys(reviewsByBusiness);

  const businessesBlock = businessNames.map((businessName) => {
    const reviewTexts = reviewsByBusiness[businessName]
      .map(r => `"${r.text}" (Rating: ${r.stars})`)
      .join('\n    - ');
    return `Business: "${businessName}"\n  Reviews:\n    - ${reviewTexts}`;
  }).join('\n\n');

  const prompt = `You are a highly skilled marketing analyst. Your task is to analyze customer reviews for MULTIPLE businesses in a single pass.

Analyze the following businesses and their reviews:
${businessesBlock}

For each business, provide:
- A concise summary (no more than 10 words)
- Key positive remarks (no more than 10 words)
- Actionable complaints with frustration intensity (low, medium, or high) AND a supporting snippet from a review.
- Any detected buying intent

Return your analysis as a single JSON object with a top-level key "businesses" which is an array of objects, one per business. Your entire response must be only the raw JSON object, with no markdown formatting or other text.

Example JSON structure:
{
  "businesses": [
    {
      "business_name": "Example Business",
      "summary": "Overall summary of the reviews for this business.",
      "positive_remarks": ["Key positive point 1.", "Key positive point 2."],
      "actionable_complaints": [
        {
          "complaint": "Specific complaint that the business can act on.",
          "frustration_intensity": "low",
          "source_quote": "Exact snippet from the review."
        }
      ],
      "buying_intent": {
        "detected": false,
        "explanation": "If true, explain why buying intent was detected."
      }
    }
  ]
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
    });

    let analysisJson;
    try {
      analysisJson = JSON.parse(llmText);
    } catch (parseError) {
      console.error('AI Analysis: Could not parse LLM\'s JSON response. Raw LLM text:', llmText, parseError);
      return { error: `Could not parse LLM's JSON response. Raw LLM text: ${llmText}` };
    }

    if (!analysisJson.businesses || analysisJson.businesses.length === 0) {
        console.warn('AI Analysis: The LLM returned no business data. Raw parsed JSON:', analysisJson);
        return { error: 'The LLM returned no business data.', rawJson: analysisJson };
    }

    // Return the raw JSON for the web app to process and display
    return { rawJson: analysisJson };

  } catch (error) {
    console.error('Error during batched LLM analysis:', error);
    return { error: `AI Analysis Error: ${error.message}` };
  }
}

export async function updateMemory(rawAnalysis, searchQuery) {
  if (!rawAnalysis) return;

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // Adjusted path to reach cli/core/memory.py from leadgap/lib/agent-functions.js
  const pythonScriptPath = path.resolve(currentDir, '../../cli/core', 'memory.py');

  if (!fs.existsSync(pythonScriptPath)) {
    const errorMsg = `[memory] Error: Python script not found at ${pythonScriptPath}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const payload = JSON.stringify({ analysis: rawAnalysis, query: searchQuery });

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [pythonScriptPath]);

    pythonProcess.stdin.write(payload);
    pythonProcess.stdin.end();

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`[memory] Cache updated successfully.`);
        // console.log(`[memory] stdout: ${stdoutData.trim()}`); // Remove verbose console.log for web backend
        resolve({ success: true, stdout: stdoutData.trim() });
      } else {
        const errorMsg = `[memory] Error updating cache (exit code ${code}).\nStderr: ${stderrData.trim()}\nStdout: ${stdoutData.trim()}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      }
    });
  });
}

export async function classifyIntent(command) {
  if (!GEMINI_API_KEY) {
    return { intent: "error", detail: "GEMINI_API_KEY not found." };
  }

  const prompt = `You are an intent classification AI. Determine the user's goal.
  
  Possible intents:
  1. "extract_reviews": User wants to find general reviews for a niche/area.
  2. "competitor_analysis": User wants a deep dive into ONE specific business/competitor.
  3. "generate_content": User wants to create marketing materials based on research.
  4. "other": General conversation.

  The user's command is: "${command}"

  Your task is to respond with a JSON object:
  {
    "intent": "extract_reviews" | "competitor_analysis" | "generate_content" | "other",
    "searchQuery": "niche/topic for extract_reviews (else null)",
    "competitorName": "exact name of business for competitor_analysis (else null)",
    "location": "city/area for competitor_analysis (else null)",
    "contentRequest": "description for generate_content (else null)"
  }

  Example: "Analyze ABC Plumbing in Austin"
  Response: { "intent": "competitor_analysis", "competitorName": "ABC Plumbing", "location": "Austin", "searchQuery": null, "contentRequest": null }

  Now, process the user's command.
  `;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });
    return JSON.parse(llmText);
  } catch (error) {
    console.error('Error during intent classification:', error);
    return { intent: "error", detail: `Failed to classify intent: ${error.message}` };
  }
}

export async function analyzeCompetitor(competitorData) {
  const { business_info, reviews } = competitorData;
  if (!GEMINI_API_KEY || !reviews || reviews.length === 0) {
    return { error: "No reviews found for this competitor to analyze." };
  }

  const businessName = business_info.name || "Competitor";
  const reviewTexts = reviews.map(r => `[Rating: ${r.stars}] ${r.text}`).join('\n- ');

  const prompt = `You are a strategic business consultant. Analyze the following reviews for "${businessName}" and create a COMPETITOR BATTLE CARD.

REVIEWS:
${reviewTexts}

Your response must be a single JSON object with the following keys:
{
  "competitor_name": "${businessName}",
  "market_position": "Vulnerable | Dominant | Declining",
  "key_vulnerabilities": [
    {
      "issue": "Specific failure description",
      "source_review": "The exact quote or snippet of the review that proves this."
    }
  ],
  "customer_frustration_level": "High | Medium | Low",
  "conversion_strategy_hook": "A 1-sentence persuasive hook to convince their customers to switch to us.",
  "strategic_recommendations": "Internal notes on how to position against them."
}

Return exactly 3 vulnerabilities. Return ONLY the raw JSON object.
`;

  try {
    const llmText = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    const card = JSON.parse(llmText);
    
    // Return the raw JSON card object. Formatting for display will be handled by the frontend.
    return { card, business_info };

  } catch (error) {
    console.error('Error during competitor analysis:', error);
    return { error: `Error analyzing competitor: ${error.message}` };
  }
}

export async function generateMarketingContent(request) {
  if (!GEMINI_API_KEY) return { error: "Error: API key missing." };

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // Adjusted path to reach cli/data/market_info.json from leadgap/lib/agent-functions.js
  const cachePath = path.resolve(currentDir, '../../cli/data', 'market_info.json');
  
  if (!fs.existsSync(cachePath)) {
    return { error: "No market research found. Please run a review extraction first (e.g., '@search plumbers in Austin') to build the intelligence cache." };
  }

  let cacheData;
  try {
    const rawCache = fs.readFileSync(cachePath, 'utf8');
    if (!rawCache || rawCache.trim() === "") throw new Error("Empty cache");
    cacheData = JSON.parse(rawCache);
  } catch (e) {
    return { error: "The market intelligence cache is empty or corrupted. Please perform fresh research." };
  }

  const prompt = `You are an expert direct-response copywriter. Use the following Market Intelligence Cache to fulfill the user's request.

MARKET INTELLIGENCE CACHE:
${JSON.stringify(cacheData, null, 2)}

USER REQUEST:
"${request}"

Your task:
1. Verify if the cache is relevant to the request. If not, politely explain what niche the cache currently covers.
2. If relevant, generate exactly what the user asked for (e.g., 2 ad copies).
3. Use the "core_pain_points" and "unmet_demands" from the cache to make the copy highly persuasive and targeted.
4. Focus on the "proposed_solutions" from the "opportunity_gaps" section.
5. Extract 2-3 exact frustrations from the negative reviews in the cache. 
   Mirror the customer's own language and emotional tone back in the copy 
   (e.g., if reviews say "waited 45 minutes", the copy should reference speed/wait time 
   directly — not generically say "fast service").
6. Apply the appropriate framework based on copy type:
   - Facebook/Instagram Ads → PAS (Problem → Agitate → Solution)
   - Google Ads → AIDA headline stack (Attention → Interest → Desire → Action)
   - Website Headlines → The "Who + What + Why Now" formula
   - General copies → Before/After/Bridge (BAB)
   Always name which framework you used above each copy.
7. Specificity rules — never write vague claims. Every copy must contain at least one:
   - Specific number, stat, or timeframe (e.g., "in under 20 mins", "rated 4.9★ by 300+ customers")
   - A named pain point pulled directly from the reviews (not paraphrased into abstraction)
   - A concrete differentiator — what THIS business does that the reviewed competitors failed at
8. Tone calibration:
   - Facebook Ads: conversational, slightly provocative, talks like a trusted friend exposing 
     a dirty secret ("Tired of [specific complaint from reviews]?")
   - Google Ads: confident, direct, benefit-first — no fluff
   - Website Headlines: authoritative but warm — position the business as the obvious solution
   - Avoid corporate language, passive voice, and filler phrases like "quality service" or 
     "customer satisfaction"
9. For each copy, write the HOOK as a standalone line first, then build the body around it.
   The hook must do one of: (a) name a specific pain from the reviews, (b) make a bold 
   contrarian claim, or (c) open a curiosity loop. Label it clearly as [HOOK].
10. After each copy, add a 1-sentence [STRATEGIST NOTE] explaining which review insight 
    it exploits and why the chosen angle should resonate with that audience.

Format the output clearly for a terminal display. Use bold headers and bullet points.
`;

  try {
    const content = await withRegionFallback(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "models/gemini-flash-latest",
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });
    return { content };
  } catch (error) {
    console.error('Error generating content:', error);
    return { error: `Error generating content: ${error.message}` };
  }
}
