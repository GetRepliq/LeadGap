// The dotenv package is now loaded via the --require flag in the `npm start` script
// This ensures that process.env variables are available before any code runs.

// --- Gemini API Configuration ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Using a specific Gemini model (e.g., gemini-pro)
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`;

/**
 * Analyzes an array of review objects using a Large Language Model (LLM).
 *
 * @param {Array<Object>} reviews - An array of review objects, each expected to have 'business_name', 'stars', and 'text'.
 * @returns {Promise<string>} A formatted string containing the LLM-generated analysis of the reviews.
 */
export async function analyzeReviews(reviews) {
  if (!GEMINI_API_KEY) {
    return "ERROR: GEMINI_API_KEY not found in .env file. Please set it up to enable AI analysis.";
  }
  if (!reviews || reviews.length === 0) {
    return "No reviews were provided to analyze.";
  }

  // Group reviews by business name for structured processing
  const reviewsByBusiness = reviews.reduce((acc, review) => {
    const businessName = review.business_name || 'Unknown Business';
    if (!acc[businessName]) {
      acc[businessName] = [];
    }
    acc[businessName].push(review);
    return acc;
  }, {});

  let fullAnalysisOutput = "--- AI-Powered Review Analysis ---";

  for (const businessName in reviewsByBusiness) {
    fullAnalysisOutput += `\n--- Business: ${businessName} ---\n`;
    const businessReviews = reviewsByBusiness[businessName];

    // Construct the prompt for the LLM
    const reviewTexts = businessReviews.map(r => `"${r.text}" (Rating: ${r.stars})`).join('\n- ');
    const prompt = `You are a highly skilled marketing analyst specializing in customer feedback.
Your task is to analyze a set of customer reviews for "${businessName}".
For each business, provide a concise summary, identify key positive remarks, list actionable complaints (along with frustration intensity), and detect any buying intent.

Return your analysis as a single JSON object.

Example JSON structure:
{
  "summary": "Overall summary of the reviews for this business.",
  "positive_remarks": ["List of key positive points."],
  "actionable_complaints": [
    {
      "complaint": "Specific complaint that the business can act on.",
      "frustration_intensity": "low" // 'low', 'medium', or 'high'
    }
  ],
  "buying_intent": {
    "detected": false, // true/false
    "explanation": "If true, explain why buying intent was detected."
  }
}

Analyze the following reviews for "${businessName}":
- ${reviewTexts}
`;

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      
      // Extract the text part from the LLM's response
      const llmText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!llmText) {
          fullAnalysisOutput += `  AI Analysis: Could not get a response from the LLM for this business. Raw LLM response: ${JSON.stringify(responseData)}
`;
          continue;
      }

      // LLMs sometimes wrap JSON in markdown or other text, try to extract clean JSON
      const jsonMatch = llmText.match(/```json\n([\s\S]*?)\n```/);
      let analysisJson;

      if (jsonMatch && jsonMatch[1]) {
        analysisJson = JSON.parse(jsonMatch[1]);
      } else {
        // If not wrapped, try to parse directly (may fail if LLM adds preamble/postamble)
        try {
            analysisJson = JSON.parse(llmText);
        } catch (parseError) {
            fullAnalysisOutput += `  AI Analysis: Could not parse LLM's JSON response for this business. Raw LLM text: ${llmText}
`;
            continue;
        }
      }

      // Format the extracted analysis for display
      fullAnalysisOutput += `  Summary: ${analysisJson.summary || 'N/A'}
`;
      if (analysisJson.positive_remarks && analysisJson.positive_remarks.length > 0) {
        fullAnalysisOutput += `  Positive Remarks: ${analysisJson.positive_remarks.join(', ')}
`;
      }
      if (analysisJson.actionable_complaints && analysisJson.actionable_complaints.length > 0) {
        fullAnalysisOutput += `  Actionable Complaints:
`;
        analysisJson.actionable_complaints.forEach((comp, idx) => {
          fullAnalysisOutput += `    ${idx + 1}. ${comp.complaint} (Frustration: ${comp.frustration_intensity || 'N/A'})
`;
        });
      }
      if (analysisJson.buying_intent && analysisJson.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: Yes - ${analysisJson.buying_intent.explanation || 'N/A'}
`;
      } else if (analysisJson.buying_intent && !analysisJson.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: No
`;
      }

    } catch (error) {
      fullAnalysisOutput += `  AI Analysis Error for ${businessName}: ${error.message}
`;
      console.error(`Error during LLM analysis for ${businessName}:`, error); // Log detailed error to console
    }
  }

  return fullAnalysisOutput;
}
