import { GoogleGenerativeAI } from "@google/generative-ai";
import Table from 'cli-table3';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Gemini API Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Regional Server Configuration ---
// Available regions:
//   us-central1     → Iowa, USA
//   us-east4        → Virginia, USA
//   europe-west4    → Netherlands
//   asia-southeast1 → Singapore
//   (null)          → Global default endpoint (generativelanguage.googleapis.com)

const REGIONAL_BASE_URLS = {
  "us-central1":     "https://us-central1-aiplatform.googleapis.com",
  "us-east4":        "https://us-east4-aiplatform.googleapis.com",
  "europe-west4":    "https://europe-west4-aiplatform.googleapis.com",
  "asia-southeast1": "https://asia-southeast1-aiplatform.googleapis.com",
};

// All regions + null (global). Shuffled at startup to distribute load
// across instances rather than everyone piling onto the same fallback
const ALL_REGIONS = [null, ...Object.keys(REGIONAL_BASE_URLS)];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Session-level active region — starts from .env preference if set, else null (global).
// Updated to whichever region last succeeded, so subsequent calls skip already-failing regions.
let activeRegion = process.env.GEMINI_REGION || null;

// Pre-shuffled fallback order for this process lifetime.
const SHUFFLED_FALLBACKS = shuffleArray(ALL_REGIONS);

/**
 * Returns the ordered list of regions to try for a given call:
 * [activeRegion, ...all others in shuffled order]
 */
function getRegionQueue() {
  return [activeRegion, ...SHUFFLED_FALLBACKS.filter(r => r !== activeRegion)];
}

/**
 * Builds a GoogleGenerativeAI instance pointed at the given region.
 * Pass null to use the global default endpoint.
 */
function buildGenAIForRegion(region) {
  if (region) {
    const baseUrl = REGIONAL_BASE_URLS[region];
    console.log(`[agent] Routing to regional endpoint: ${baseUrl} (${region})`);
    return new GoogleGenerativeAI(GEMINI_API_KEY, { baseUrl });
  }
  console.log(`[agent] Routing to global endpoint.`);
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

/**
 * Returns true if the error is a retryable 503 overload, false for anything
 * else (auth errors, bad requests, etc.) that shouldn't trigger a region switch.
 */
function is503(error) {
  return (
    error?.message?.includes('503') ||
    error?.message?.includes('Service Unavailable') ||
    error?.message?.includes('high demand')
  );
}

/**
 * Wraps a model-using function with automatic region fallback on 503.
 * `apiFn` receives a configured GoogleGenerativeAI instance and should return a promise.
 * On success the winning region is remembered for the session.
 */
async function withRegionFallback(apiFn) {
  const queue = getRegionQueue();

  for (const region of queue) {
    const regionLabel = region ?? 'global';
    try {
      const genAI = buildGenAIForRegion(region);
      const result = await apiFn(genAI);
      // Remember the winner so next call starts here
      if (activeRegion !== region) {
        console.log(`[agent] Region "${regionLabel}" succeeded — pinning for this session.`);
        activeRegion = region;
      }
      return result;
    } catch (error) {
      if (is503(error)) {
        console.warn(`[agent] Region "${regionLabel}" returned 503 — trying next region...`);
        // Small pause before hitting the next endpoint
        await new Promise(res => setTimeout(res, 600));
        continue;
      }
      // Non-retryable error — rethrow immediately
      throw error;
    }
  }

  throw new Error(
    '[agent] All regions returned 503. Gemini is experiencing widespread issues. Please try again later.'
  );
}

/**
 * Analyzes an array of review objects using the @google/generative-ai library.
 * All businesses are sent in a single batched API call.
 *
 * @param {Array<Object>} reviews - An array of review objects, each expected to have 'business_name', 'stars', and 'text'.
 * @returns {Promise<string>} A formatted string containing the LLM-generated analysis of the reviews.
 */
export async function analyzeReviews(reviews) {
  if (!GEMINI_API_KEY) {
    return { formattedAnalysis: "ERROR: GEMINI_API_KEY not found. Please ensure it is set in your .env file.", rawJson: null };
  }
  if (!reviews || reviews.length === 0) {
    return { formattedAnalysis: "No reviews were provided to analyze.", rawJson: null };
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
- Actionable complaints with frustration intensity (low, medium, or high)
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
          "frustration_intensity": "low"
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

  let fullAnalysisOutput = "--- AI-Powered Review Analysis ---\n\n";

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
      return { 
        formattedAnalysis: fullAnalysisOutput + `\n  AI Analysis: Could not parse LLM's JSON response. Raw LLM text: ${llmText}`, 
        rawJson: null 
      };
    }

    const businesses = analysisJson.businesses || [];

    if (businesses.length === 0) {
      return {
        formattedAnalysis: fullAnalysisOutput + `\n  AI Analysis: The LLM returned no business data. Raw parsed JSON: ${JSON.stringify(analysisJson)}`,
        rawJson: analysisJson
      };
    }

    for (const business of businesses) {
      const businessName = business.business_name || 'Unknown';
      const summary = business.summary || 'N/A';
      const positiveRemarks = business.positive_remarks || [];
      const complaints = business.actionable_complaints || [];
      const buyingIntent = business.buying_intent || {};

      fullAnalysisOutput += `--- Business: ${businessName} ---\n`;
      fullAnalysisOutput += `  Summary: ${summary}\n`;

      if (positiveRemarks.length > 0) {
        fullAnalysisOutput += `  Positive Remarks: ${positiveRemarks.join(', ')}\n`;
      } else {
        fullAnalysisOutput += `  Positive Remarks: N/A\n`;
      }

      if (complaints.length > 0) {
        fullAnalysisOutput += `  Actionable Complaints:\n`;
        complaints.forEach((comp, idx) => {
          fullAnalysisOutput += `    ${idx + 1}. ${comp.complaint} (Frustration: ${comp.frustration_intensity || 'N/A'})\n`;
        });
      } else {
        fullAnalysisOutput += `  Actionable Complaints: None\n`;
      }

      if (buyingIntent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: Yes - ${buyingIntent.explanation || 'N/A'}\n`;
      } else {
        fullAnalysisOutput += `  Buying Intent Detected: No\n`;
      }

      fullAnalysisOutput += '\n';
    }

    fullAnalysisOutput += "--- Summary Table ---\n\n";

    const terminalWidth = process.stdout.columns || 120;
    const tableWidth = Math.min(terminalWidth, 160) - 4;

    const table = new Table({
      head: ['Business', 'Summary', '# Positives', '# Complaints', 'Top Complaint', 'Buying Intent'],
      colWidths: [
        Math.floor(tableWidth * 0.13),
        Math.floor(tableWidth * 0.25),
        Math.floor(tableWidth * 0.08),
        Math.floor(tableWidth * 0.08),
        Math.floor(tableWidth * 0.30),
        Math.floor(tableWidth * 0.16),
      ],
      wordWrap: true,
      style: { 'padding-left': 1, 'padding-right': 1, head: ['cyan'] },
    });

    for (const business of businesses) {
      const businessName = business.business_name || 'Unknown';
      const summary = business.summary || 'N/A';
      const positiveCount = (business.positive_remarks || []).length.toString();
      const complaintCount = (business.actionable_complaints || []).length.toString();

      const topComplaint = (business.actionable_complaints && business.actionable_complaints.length > 0)
        ? `${business.actionable_complaints[0].complaint} (${business.actionable_complaints[0].frustration_intensity || 'N/A'})`
        : 'None';

      const buyingIntentLabel = (business.buying_intent && business.buying_intent.detected) ? 'Yes' : 'No';

      table.push([businessName, summary, positiveCount, complaintCount, topComplaint, buyingIntentLabel]);
    }

    fullAnalysisOutput += table.toString();

    return { formattedAnalysis: fullAnalysisOutput, rawJson: analysisJson };

  } catch (error) {
    fullAnalysisOutput += `\n  AI Analysis Error: ${error.message}`;
    console.error('Error during batched LLM analysis:', error);
    return { formattedAnalysis: fullAnalysisOutput, rawJson: null };
  }
}

/**
 * Updates market intelligence cache by spawning the memory.py
 * 
 * @param {Object} rawAnalysis - The raw JSON analysis from the LLM.
 * @param {string} searchQuery - The user's original search query.
 * @returns {Promise<void>}
 */
export async function updateMemory(rawAnalysis, searchQuery) {
  if (!rawAnalysis) return;

  const pythonScriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.py');
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
        console.log(`[memory] stdout: ${stdoutData.trim()}`);
        resolve();
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

  const prompt = `You are an intent classification AI. You need to determine if the user's goal is to 'extract reviews' for a specific entity.

  The user's command is: "${command}"

  Your task is to respond with a JSON object that has two fields:
  1. "intent": This should be either "extract_reviews" or "other".
  2. "searchQuery": If the intent is "extract_reviews", this field should contain the specific topic or entity the user wants to find reviews for. If the intent is "other", this field should be null.

  Example 1:
  User command: "Can you find reviews for the new coffee shop on Main Street?"
  Your JSON response:
  {
    "intent": "extract_reviews",
    "searchQuery": "the new coffee shop on Main Street"
  }

  Example 2:
  User command: "hello, how are you?"
  Your JSON response:
  {
    "intent": "other",
    "searchQuery": null
  }

  Example 3:
  User command: "show me what people are saying about 'Global Pizzeria'"
  Your JSON response:
  {
    "intent": "extract_reviews",
    "searchQuery": "Global Pizzeria"
  }

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
    return { intent: "error", detail: "Failed to classify intent." };
  }
}