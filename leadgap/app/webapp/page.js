"use client";

import { useState } from "react";

export default function AgentPage() {
  const [input, setInput] = useState("");

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
        style={{ background: "#0d0d0d", border: "1px solid rgba(255, 255, 255, 0.55)" }}
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
            style={{ fontSize: "22px", color: "rgba(255, 255, 255, 0.55)" }}
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
              fontSize: "13px",
              color: "rgba(255, 255, 255, 0.55)",
              lineHeight: "160%",
              maxWidth: "420px",
            }}
          >
            I&apos;m ready to analyze market reviews, identify competitor
            weaknesses, and build your winning strategy. What gap should we
            bridge today?
          </p>
        </div>

        {/* ── Input bar — pinned to bottom ── */}
        <div className="px-8 pb-8">
          <div
            className="flex items-center gap-3 w-full mx-auto px-5 py-4"
            style={{
              maxWidth: "600px",
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
              placeholder="Analyze Cafes in London ..."
              className="agent-subheading flex-1 bg-transparent outline-none"
              style={{
                fontSize: "14px",
                color: "rgba(255, 255, 255, 0.55)",
                caretColor: "#4a9eff",
              }}
            />
          </div>

          {/* Status bar */}
          <p
            className="agent-subheading text-center mt-3"
            style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.55)" }}
          >
            &gt; Engine: Gemini-3-flash | Context Memory: 15% used | Status: Optimized
          </p>
        </div>

      </div>
    </div>
  );
}