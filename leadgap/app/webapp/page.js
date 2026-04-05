"use client";

import { useState } from "react";

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setResponse(null); // Clear previous response
    try {
      const apiResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input }),
      });

      const data = await apiResponse.json();
      setResponse(data); // Store the raw JSON response
      console.log('API Response:', data);
    } catch (error) {
      console.error('Frontend Fetch Error:', error);
      setResponse({ error: error.message || "An unknown error occurred." });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        background: "#0a0a0a",
        fontFamily: "var(--font-jetbrains-mono), 'Courier New', monospace",
      }}
    >
      {/* Outer frame */}
      <div
        className="flex-1 flex flex-col mx-auto w-full max-w-[1200px] my-8 overflow-hidden"
        style={{ border: "1px solid rgba(255, 255, 255, 0)" }}
      >

        {/* ── Main content area ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-32 text-center">

          {/* LeadGap plus logo */}
          <div className="mb-6" style={{ color: "rgba(255, 255, 255, 0.55)" }}>
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="27" y="4" width="10" height="56" rx="3" fill="currentColor"/>
              <rect x="4" y="27" width="56" height="10" rx="3" fill="currentColor"/>
            </svg>
          </div>

          {/* Greeting */}
          <p
            className="agent-subheading mb-1"
            style={{ fontSize: "28px", color: "rgba(255, 255, 255, 0.55)" }}
          >
            Hi Dean Winchester
          </p>

          {/* Main prompt */}
          <h1
            className="agent-heading"
            style={{
              fontSize: "28px",
              color: "#e0e0e0",
              lineHeight: "107%",
              marginBottom: "24px",
            }}
          >
            Can I help you with anything ?
          </h1>

          {/* Subtext */}
          <p
            className="agent-subheading"
            style={{
              fontSize: "15px",
              color: "rgba(255, 255, 255, 0.55)",
              lineHeight: "130%",
              maxWidth: "470px",
            }}
          >
            I&apos;m ready to analyze market reviews, identify competitor
            weaknesses, and build your winning strategy. What gap should we
            bridge today?
          </p>

          {/* API Response Display (for debugging) */}
          {loading && (
            <div className="mt-8 text-white">Loading...</div>
          )}
          {response && (
            <div
              className="mt-8 p-4 bg-gray-800 rounded text-left"
              style={{
                maxWidth: "600px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "rgba(255, 255, 255, 0.7)",
                fontSize: "14px",
              }}
            >
              <h3 className="font-bold mb-2">API Response:</h3>
              <pre>{JSON.stringify(response, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* ── Input bar — pinned to bottom ── */}
        <div className="px-8 pb-8">
          {/* Container to handle alignment for both elements */}
          <div className="mx-auto" style={{ maxWidth: "600px" }}>
            
            {/* Input Bar */}
            <div
              className="flex items-center gap-3 w-full px-5 py-2"
              style={{
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.55)",
              }}
            >
              {/* Arrow prompt */}
              <span
                className="agent-subheading"
                style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: "14px", flexShrink: 0 }}
              >
                →
              </span>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={loading ? "Thinking..." : "Analyze Cafes in London ..."}
                className="agent-subheading flex-1 bg-transparent outline-none"
                style={{
                  fontSize: "14px",
                  color: "rgba(255, 255, 255, 0.55)",
                  caretColor: "#4a9eff",
                }}
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.55)",
                  color: "rgba(255, 255, 255, 0.55)",
                  padding: "4px 8px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "12px",
                }}
              >
                Send
              </button>
            </div>

            {/* Status bar - Now inside the 600px max-width wrapper */}
            <p
              className="agent-subheading mt-3"
              style={{ 
                fontSize: "13px", 
                color: "rgba(255, 255, 255, 0.30)", 
                textAlign: "left" 
              }}
            >
              &gt; Engine: Gemini-3-flash | Context Memory: 15% used | Status: {loading ? "Processing..." : "Optimized"}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}