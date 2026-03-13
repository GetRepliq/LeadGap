import { GoogleGenerativeAI } from "@google/generative-ai";
import Table from 'cli-table3';

// --- Gemini API Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Analyzes an array of review objects using the @google/generative-ai library.
 * All businesses are sent in a single batched API call.
 *
 * @param {Array<Object>} reviews - An array of review objects, each expected to have 'business_name', 'stars', and 'text'.
 * @returns {Promise<string>} A formatted string containing the LLM-generated analysis of the reviews.
 */
export async function analyzeReviews(reviews) {
  if (!GEMINI_API_KEY) {
    return "ERROR: GEMINI_API_KEY not found. Please ensure it is set in your .env file.";
  }
  if (!reviews || reviews.length === 0) {
    return "No reviews were provided to analyze.";
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-flash-latest",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

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
- A concise summary
- Key positive remarks
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
    const result = await model.generateContent(prompt);
    const response = result.response;
    const llmText = response.text();

    let analysisJson;
    try {
      analysisJson = JSON.parse(llmText);
    } catch (parseError) {
      return fullAnalysisOutput + `\n  AI Analysis: Could not parse LLM's JSON response. Raw LLM text: ${llmText}`;
    }

    const businesses = analysisJson.businesses || [];

    if (businesses.length === 0) {
      return fullAnalysisOutput + `\n  AI Analysis: The LLM returned no business data. Raw parsed JSON: ${JSON.stringify(analysisJson)}`;
    }

    // -------------------------------------------------------
    // SECTION 1: Written detailed breakdown per business
    // -------------------------------------------------------
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

    // -------------------------------------------------------
    // SECTION 2: Condensed summary table
    // -------------------------------------------------------
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

  } catch (error) {
    fullAnalysisOutput += `\n  AI Analysis Error: ${error.message}`;
    console.error('Error during batched LLM analysis:', error);
  }

  return fullAnalysisOutput;
}

export async function classifyIntent(command) {
  if (!GEMINI_API_KEY) {
    return { intent: "error", detail: "GEMINI_API_KEY not found." };
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-flash-latest",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

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
    const result = await model.generateContent(prompt);
    const response = result.response;
    const llmText = response.text();
    return JSON.parse(llmText);
  } catch (error) {
    console.error('Error during intent classification:', error);
    return { intent: "error", detail: "Failed to classify intent." };
  }
}