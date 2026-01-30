// tanner.tsx
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import Gradient from "ink-gradient";
import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
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
        setHistory((prev) => [...prev, `Tanner AI: ${message}`]);
        stderrData += message;
      });
      pythonProcess.on("close", (code) => {
        if (code === 0) {
          try {
            const reviews = JSON.parse(stdoutData);
            let formattedReviews = `Tanner AI: Found ${reviews.length} reviews.
`;
            reviews.forEach((review, index) => {
              formattedReviews += `
Review ${index + 1} for ${review.business_name}:
`;
              formattedReviews += `Stars: ${review.stars}
`;
              formattedReviews += `Text: ${review.text}
`;
            });
            setHistory((prev) => [...prev, formattedReviews]);
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
