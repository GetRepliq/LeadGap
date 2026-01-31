// tanner.tsx
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import Gradient from "ink-gradient";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// core/agent.js
var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
var ANTHROPIC_API_URL = `https://api.anthropic.com/v1/messages`;
async function analyzeReviews(reviews) {
  if (!ANTHROPIC_API_KEY) {
    return "ERROR: ANTHROPIC_API_KEY not found in .env file. Please set it up to enable AI analysis.";
  }
  if (!reviews || reviews.length === 0) {
    return "No reviews were provided to analyze.";
  }
  const reviewsByBusiness = reviews.reduce((acc, review) => {
    const businessName = review.business_name || "Unknown Business";
    if (!acc[businessName]) {
      acc[businessName] = [];
    }
    acc[businessName].push(review);
    return acc;
  }, {});
  const businessNames = Object.keys(reviewsByBusiness);
  const businessesBlock = businessNames.map((businessName) => {
    const reviewTexts = reviewsByBusiness[businessName].map((r) => `"${r.text}" (Rating: ${r.stars})`).join("\n    - ");
    return `Business: "${businessName}"
  Reviews:
    - ${reviewTexts}`;
  }).join("\n\n");
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANTHROPIC_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a highly skilled marketing analyst specializing in customer feedback. Always respond with valid JSON only, no preamble or markdown wrapping."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    const responseData = await response.json();
    const llmText = responseData.choices?.[0]?.message?.content;
    if (!llmText) {
      return fullAnalysisOutput + `
  AI Analysis: Could not get a response from the LLM. Raw response: ${JSON.stringify(responseData)}`;
    }
    const jsonMatch = llmText.match(/```json\n([\s\S]*?)\n```/);
    let analysisJson;
    if (jsonMatch && jsonMatch[1]) {
      analysisJson = JSON.parse(jsonMatch[1]);
    } else {
      try {
        analysisJson = JSON.parse(llmText);
      } catch (parseError) {
        return fullAnalysisOutput + `
  AI Analysis: Could not parse LLM's JSON response. Raw LLM text: ${llmText}`;
      }
    }
    const businesses = analysisJson.businesses || [];
    if (businesses.length === 0) {
      return fullAnalysisOutput + `
  AI Analysis: The LLM returned no business data. Raw parsed JSON: ${JSON.stringify(analysisJson)}`;
    }
    for (const business of businesses) {
      fullAnalysisOutput += `
--- Business: ${business.business_name || "Unknown"} ---
`;
      fullAnalysisOutput += `  Summary: ${business.summary || "N/A"}
`;
      if (business.positive_remarks && business.positive_remarks.length > 0) {
        fullAnalysisOutput += `  Positive Remarks: ${business.positive_remarks.join(", ")}
`;
      }
      if (business.actionable_complaints && business.actionable_complaints.length > 0) {
        fullAnalysisOutput += `  Actionable Complaints:
`;
        business.actionable_complaints.forEach((comp, idx) => {
          fullAnalysisOutput += `    ${idx + 1}. ${comp.complaint} (Frustration: ${comp.frustration_intensity || "N/A"})
`;
        });
      }
      if (business.buying_intent && business.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: Yes - ${business.buying_intent.explanation || "N/A"}
`;
      } else if (business.buying_intent && !business.buying_intent.detected) {
        fullAnalysisOutput += `  Buying Intent Detected: No
`;
      }
    }
  } catch (error) {
    fullAnalysisOutput += `
  AI Analysis Error: ${error.message}`;
    console.error("Error during batched LLM analysis:", error);
  }
  return fullAnalysisOutput;
}

// tanner.tsx
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var HEADER_ASCII = `
\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 
\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557
   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D
   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557
   \u2588\u2588\u2551   \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551
   \u255A\u2550\u255D   \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D
`.trim();
var Header = () => /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", alignItems: "flex-start", paddingBottom: 1 }, /* @__PURE__ */ React.createElement(Gradient, { name: "morning" }, /* @__PURE__ */ React.createElement(Text, { bold: true }, HEADER_ASCII)), /* @__PURE__ */ React.createElement(Box, { marginTop: 1, width: 80, justifyContent: "flex-start" }, /* @__PURE__ */ React.createElement(Text, { color: "gray", dimColor: true, italic: true, wrap: "wrap" }, "An AI platform that analyzes real customer complaints to reveal unmet service demand")));
var ChatHistory = ({ history }) => /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", paddingBottom: 1 }, history.map((message, index) => /* @__PURE__ */ React.createElement(Text, { key: index }, message)));
var InputBox = ({ value }) => {
  const parts = value.split(/(@\S+)/);
  return /* @__PURE__ */ React.createElement(Box, { borderStyle: "single", paddingX: 1 }, /* @__PURE__ */ React.createElement(Text, null, parts.map((part, i) => {
    if (part.startsWith("@")) {
      return /* @__PURE__ */ React.createElement(Text, { key: i, color: "red" }, part);
    }
    return part;
  }), "\u2588"));
};
var FileSuggestions = ({ suggestions, activeIndex }) => {
  if (suggestions.length === 0) {
    return null;
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", borderStyle: "single", width: 80 }, suggestions.map((suggestion, index) => {
    const color = index === activeIndex ? "red" : "white";
    return /* @__PURE__ */ React.createElement(Text, { key: suggestion, color }, suggestion);
  }));
};
var App = () => {
  const { exit } = useApp();
  const [history, setHistory] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionBoxVisible, setSuggestionBoxVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (suggestionBoxVisible) {
      fs.readdir(process.cwd(), (err, files) => {
        if (err) {
        } else {
          setSuggestions(files);
        }
      });
    }
  }, [suggestionBoxVisible]);
  const handleCommand = (command) => {
    const extractorCommand = "extract reviews for ";
    if (command.startsWith(extractorCommand)) {
      const searchQuery = command.substring(extractorCommand.length);
      setHistory((prev) => [...prev, `> ${command}`, `Tanner AI: Starting review extraction for "${searchQuery}"...`]);
      const pythonScriptPath = path.join(__dirname, "..", "core", "utils.py");
      const pythonProcess = spawn("python3", [pythonScriptPath, searchQuery]);
      let stdoutData = "";
      let stderrData = "";
      pythonProcess.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });
      pythonProcess.stderr.on("data", (data) => {
        const message = data.toString();
        stderrData += message;
      });
      pythonProcess.on("close", async (code) => {
        if (code === 0) {
          try {
            const reviews = JSON.parse(stdoutData);
            setHistory((prev) => [...prev, `Tanner AI: Found ${reviews.length} reviews. Now analyzing...`]);
            const analysis = await analyzeReviews(reviews);
            setHistory((prev) => [...prev, `Tanner AI:
${analysis}`]);
          } catch (e) {
            setHistory((prev) => [...prev, `Tanner AI: Error parsing reviews. Raw output: ${stdoutData}`]);
          }
        } else {
          setHistory((prev) => [...prev, `Tanner AI: Error during review extraction (exit code ${code}).
${stderrData}`]);
        }
      });
    } else {
      setHistory((prevHistory) => [
        ...prevHistory,
        `> ${command}`,
        `Tanner AI: ${command}`
      ]);
    }
  };
  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "c") {
      exit();
    }
    if (suggestionBoxVisible) {
      if (key.upArrow) {
        setActiveIndex((prev) => prev > 0 ? prev - 1 : suggestions.length - 1);
      } else if (key.downArrow) {
        setActiveIndex((prev) => prev < suggestions.length - 1 ? prev + 1 : 0);
      } else if (key.return) {
        setInputValue(inputValue.slice(0, -1) + suggestions[activeIndex] + " ");
        setSuggestionBoxVisible(false);
      } else if (key.backspace || key.delete) {
        setInputValue(inputValue.slice(0, -1));
        if (inputValue.slice(0, -1).endsWith("@") === false) {
          setSuggestionBoxVisible(false);
        }
      } else {
        setInputValue(inputValue + input);
      }
    } else {
      if (key.return) {
        handleCommand(inputValue);
        setInputValue("");
      } else if (key.backspace || key.delete) {
        setInputValue(inputValue.slice(0, -1));
      } else {
        if ((inputValue + input).endsWith("@")) {
          setSuggestionBoxVisible(true);
        }
        setInputValue(inputValue + input);
      }
    }
  });
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: "100%", height: "100%" }, /* @__PURE__ */ React.createElement(Header, null), /* @__PURE__ */ React.createElement(ChatHistory, { history }), /* @__PURE__ */ React.createElement(Box, { flexGrow: 1 }), /* @__PURE__ */ React.createElement(
    InputBox,
    {
      value: inputValue
    }
  ), suggestionBoxVisible && /* @__PURE__ */ React.createElement(FileSuggestions, { suggestions, activeIndex }));
};
render(/* @__PURE__ */ React.createElement(App, null));
