import { GoogleGenerativeAI } from "@google/generative-ai";

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

  // Initialize the Google Generative AI client
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "models/gemini-flash-latest",
    generationConfig: {
      responseMimeType: "application/json", // Request JSON output
    },
  });

  // Group reviews by business name for structured processing
  const reviewsByBusiness = reviews.reduce((acc, review) => {
    const businessName = review.business_name || 'Unknown Business';
    if (!acc[businessName]) {
      acc[businessName] = [];
    }
    acc[businessName].push(review);
    return acc;
  }, {});

  // --- Build a single batched prompt containing ALL businesses ---
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

Provide a comprehensive analysis in JSON format. The JSON object should have the following structure:
{
  "overall_summary": "A high-level summary of common themes, strengths, and weaknesses observed across all businesses. Highlight any significant trends or outliers.",
  "businesses": [
    {
      "business_name": "Example Business",
      "summary": "A concise summary of the reviews for this specific business, touching on overall sentiment and key aspects.",
      "positive_remarks": [
        "Clearly articulated positive point 1 (e.g., 'fast service', 'friendly staff').",
        "Clearly articulated positive point 2."
      ],
      "actionable_complaints": [
        {
          "complaint": "Specific, actionable complaint (e.g., 'long wait times', 'unclear pricing').",
          "frustration_intensity": "low" | "medium" | "high",
          "impact": "brief description of the negative impact (e.g., 'customers left frustrated', 'lost sales')."
        }
      ],
      "buying_intent": {
        "detected": true | false,
        "explanation": "If true, explain why buying intent was detected from the reviews (e.g., 'customers asking about loyalty programs', 'desire for repeat purchases')."
      }
    }
  ],
  "recommendations": "Based on the overall analysis, provide strategic recommendations for businesses in this market segment to improve customer satisfaction and capture unmet demand."
}

Ensure your entire response is only the raw JSON object, with no markdown formatting or other extraneous text.
`;

  let fullAnalysisOutput = "--- AI-Powered Review Analysis ---\n";

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

    fullAnalysisOutput += `\nOverall Summary:\n  ${analysisJson.overall_summary || 'N/A'}\n`;

    const businesses = analysisJson.businesses || [];

    if (businesses.length === 0) {
      return fullAnalysisOutput + `\n  AI Analysis: The LLM returned no business data. Raw parsed JSON: ${JSON.stringify(analysisJson)}`;
    }

    for (const business of businesses) {
      fullAnalysisOutput += `\n--- Business: ${business.business_name || 'Unknown'} ---\n`;

      fullAnalysisOutput += `  Summary: ${business.summary || 'N/A'}\n`;

      if (business.positive_remarks && business.positive_remarks.length > 0) {
        fullAnalysisOutput += `  Positive Remarks:\n`;
        business.positive_remarks.forEach((remark, idx) => {
          fullAnalysisOutput += `    - ${remark}\n`;
        });
      }

      if (business.actionable_complaints && business.actionable_complaints.length > 0) {
        fullAnalysisOutput += `  Actionable Complaints:\n`;
        business.actionable_complaints.forEach((comp, idx) => {
          fullAnalysisOutput += `    ${idx + 1}. ${comp.complaint} (Frustration: ${comp.frustration_intensity || 'N/A'})\n`;
          if (comp.impact) {
            fullAnalysisOutput += `       Impact: ${comp.impact}\n`;
          }
        });
      }

      if (business.buying_intent && business.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: Yes - ${business.buying_intent.explanation || 'N/A'}\n`;
      } else if (business.buying_intent && !business.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: No\n`;
      }
    }

    if (analysisJson.recommendations) {
      fullAnalysisOutput += `\nStrategic Recommendations:\n  ${analysisJson.recommendations}\n`;
    }

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
