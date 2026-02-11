import { GoogleGenerativeAI } from "@google/generative-ai";

// The dotenv package is now loaded via the --require flag in the `npm start` script
// This ensures that process.env variables are available before any code runs.

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

  let fullAnalysisOutput = "--- AI-Powered Review Analysis ---\n";

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const llmText = response.text();
    
    let analysisJson;
    try {
      // Since we requested JSON output, we can parse it directly
      analysisJson = JSON.parse(llmText);
    } catch (parseError) {
      return fullAnalysisOutput + `\n  AI Analysis: Could not parse LLM's JSON response. Raw LLM text: ${llmText}`;
    }

    // --- Format the parsed batch response for each business ---
    const businesses = analysisJson.businesses || [];

    if (businesses.length === 0) {
      return fullAnalysisOutput + `\n  AI Analysis: The LLM returned no business data. Raw parsed JSON: ${JSON.stringify(analysisJson)}`;
    }

    for (const business of businesses) {
      fullAnalysisOutput += `\n--- Business: ${business.business_name || 'Unknown'} ---\n`;

      fullAnalysisOutput += `  Summary: ${business.summary || 'N/A'}\n`;

      if (business.positive_remarks && business.positive_remarks.length > 0) {
        fullAnalysisOutput += `  Positive Remarks: ${business.positive_remarks.join(', ')}\n`;
      }

      if (business.actionable_complaints && business.actionable_complaints.length > 0) {
        fullAnalysisOutput += `  Actionable Complaints:\n`;
        business.actionable_complaints.forEach((comp, idx) => {
          fullAnalysisOutput += `    ${idx + 1}. ${comp.complaint} (Frustration: ${comp.frustration_intensity || 'N/A'})\n`;
        });
      }

      if (business.buying_intent && business.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: Yes - ${business.buying_intent.explanation || 'N/A'}\n`;
      } else if (business.buying_intent && !business.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: No\n`;
      }
    }

  } catch (error) {
    fullAnalysisOutput += `\n  AI Analysis Error: ${error.message}`;
    console.error('Error during batched LLM analysis:', error);
  }

  return fullAnalysisOutput;
}
