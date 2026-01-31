// The dotenv package is now loaded via the --require flag in the `npm start` script
// This ensures that process.env variables are available before any code runs.

// --- Anthropic Claude API Configuration ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = `https://api.anthropic.com/v1/messages`;

/**
 * Analyzes an array of review objects using a Large Language Model (LLM).
 * All businesses are sent in a single batched API call to avoid rate limits.
 *
 * @param {Array<Object>} reviews - An array of review objects, each expected to have 'business_name', 'stars', and 'text'.
 * @returns {Promise<string>} A formatted string containing the LLM-generated analysis of the reviews.
 */
export async function analyzeReviews(reviews) {
  if (!ANTHROPIC_API_KEY) {
    return "ERROR: ANTHROPIC_API_KEY not found in .env file. Please set it up to enable AI analysis.";
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

  // --- Build a single batched prompt containing ALL businesses ---
  const businessNames = Object.keys(reviewsByBusiness);

  const businessesBlock = businessNames.map((businessName) => {
    const reviewTexts = reviewsByBusiness[businessName]
      .map(r => `"${r.text}" (Rating: ${r.stars})`)
      .join('\n    - ');
    return `Business: "${businessName}"\n  Reviews:\n    - ${reviewTexts}`;
  }).join('\n\n');

  const prompt = `You are a highly skilled marketing analyst specializing in customer feedback.
Your task is to analyze customer reviews for MULTIPLE businesses in a single pass.

For each business, provide:
- A concise summary
- Key positive remarks
- Actionable complaints with frustration intensity (low, medium, or high)
- Any detected buying intent

Return your analysis as a single JSON object with a top-level key "businesses" which is an array of objects, one per business.

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

Analyze the following businesses and their reviews:

${businessesBlock}
`;

  let fullAnalysisOutput = "--- AI-Powered Review Analysis ---";

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANTHROPIC_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a highly skilled marketing analyst specializing in customer feedback. Always respond with valid JSON only, no preamble or markdown wrapping.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    // Extract the text from OpenAI's response structure
    const llmText = responseData.choices?.[0]?.message?.content;

    if (!llmText) {
      return fullAnalysisOutput + `\n  AI Analysis: Could not get a response from the LLM. Raw response: ${JSON.stringify(responseData)}`;
    }

    // LLMs sometimes wrap JSON in markdown code blocks — strip them if present
    const jsonMatch = llmText.match(/```json\n([\s\S]*?)\n```/);
    let analysisJson;

    if (jsonMatch && jsonMatch[1]) {
      analysisJson = JSON.parse(jsonMatch[1]);
    } else {
      try {
        analysisJson = JSON.parse(llmText);
      } catch (parseError) {
        return fullAnalysisOutput + `\n  AI Analysis: Could not parse LLM's JSON response. Raw LLM text: ${llmText}`;
      }
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