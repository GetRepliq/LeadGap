"use client";

import { useState, useEffect } from "react";

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setResponse(null);
    setLogs([]);

    // Initial logs
    setLogs([
      { text: `Agent initiated for: "${input}"`, type: "info" },
      { text: "Classifying intent...", type: "step" },
    ]);

    try {
      const apiResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      const data = await apiResponse.json();

      // Artificial delays for agentic "feel"
      await new Promise(r => setTimeout(r, 600));

      if (data.intent === 'extract_reviews') {
        setLogs(prev => [...prev, { text: "Intent detected: Market Research", type: "step" }]);
        await new Promise(r => setTimeout(r, 800));
        setLogs(prev => [...prev, { text: "Accessing Google Maps review clusters...", type: "step" }]);
        await new Promise(r => setTimeout(r, 1200));
        setLogs(prev => [...prev, { text: "LLM synthesis in progress...", type: "step" }]);
        await new Promise(r => setTimeout(r, 1000));
        setLogs(prev => [...prev, { text: "Market intelligence synced to persistent cache.", type: "step" }]);
      } else if (data.intent === 'competitor_analysis') {
        setLogs(prev => [...prev, { text: "Intent detected: Competitor Surgical Analysis", type: "step" }]);
        await new Promise(r => setTimeout(r, 800));
        setLogs(prev => [...prev, { text: "Fetching business profile & contact data...", type: "step" }]);
        await new Promise(r => setTimeout(r, 1200));
        setLogs(prev => [...prev, { text: "Identifying vulnerabilities & strategic gaps...", type: "step" }]);
        await new Promise(r => setTimeout(r, 1000));
        setLogs(prev => [...prev, { text: "Battle card generation complete.", type: "step" }]);
      } else if (data.intent === 'generate_content') {
        setLogs(prev => [...prev, { text: "Intent detected: Content Generation", type: "step" }]);
        await new Promise(r => setTimeout(r, 800));
        setLogs(prev => [...prev, { text: "Retrieving niche insights from cache...", type: "step" }]);
        await new Promise(r => setTimeout(r, 1000));
        setLogs(prev => [...prev, { text: "Applying copy frameworks (PAS/AIDA)...", type: "step" }]);
      } else {
        setLogs(prev => [...prev, { text: "Processing general inquiry...", type: "step" }]);
      }

      await new Promise(r => setTimeout(r, 500));
      setLogs(prev => [...prev, { text: "Response ready.", type: "info" }]);
      
      setResponse(data);
    } catch (error) {
      setLogs(prev => [...prev, { text: "Critical Error: Process aborted.", type: "error" }]);
      setResponse({ error: error.message });
    } finally {
      // Small final delay so the user sees "Response ready" before the pulse stops
      setTimeout(() => setLoading(false), 800);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col text-sm"
      style={{
        background: "#0a0a0a",
        color: "rgba(255, 255, 255, 0.7)",
        fontFamily: "var(--font-jetbrains-mono), 'Courier New', monospace",
      }}
    >
      <div className={`flex-1 flex flex-col mx-auto w-full max-w-[900px] px-6 transition-all duration-700 ease-in-out ${!response && !loading ? 'justify-center' : 'pt-8'}`}>
        
        {/* ── Header ── */}
        <div className={`flex flex-col items-center justify-center text-center transition-all duration-700 ease-in-out ${!response && !loading ? 'mb-12' : 'mb-10 scale-75 origin-top'}`}>
          <div className={`transition-all duration-700 ${!response && !loading ? 'mb-8' : 'mb-4'}`} style={{ color: "rgba(255, 255, 255, 0.45)" }}>
            <svg width={!response && !loading ? "60" : "40"} height={!response && !loading ? "60" : "40"} viewBox="0 0 64 64" fill="none">
              <rect x="27" y="4" width="10" height="56" rx="2" fill="currentColor"/>
              <rect x="4" y="27" width="56" height="10" rx="3" fill="currentColor"/>
            </svg>
          </div>
          <p className={`${!response && !loading ? 'text-2xl' : 'text-xl'} mb-1 opacity-60 transition-all duration-700`}>Hi Dean Winchester</p>
          <h1 className={`${!response && !loading ? 'text-2xl' : 'text-xl'} text-white font-medium transition-all duration-700 ${!response && !loading ? 'mb-6' : 'mb-2'}`}>Can I help you with anything?</h1>
          <p className={`max-w-[480px] leading-relaxed opacity-50 transition-all duration-700 ${!response && !loading ? 'text-sm' : 'text-xs'}`}>
            I&apos;m ready to analyze market reviews, identify competitor weaknesses, and build your winning strategy.
          </p>
        </div>

        {/* ── Results Area ── */}
        <div className={`flex flex-col transition-opacity duration-700 ${!response && !loading ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
          {response && (
            <div className="space-y-6 mb-8">
              {/* Market Analysis View */}
              {response.rawJson?.businesses?.map((biz, idx) => (
                <div key={idx} className="space-y-1">
                  <h3 className="text-white font-medium">
                    {idx + 1}. Business: {biz.business_name}
                  </h3>
                  <div className="pl-5 space-y-0.5 opacity-80">
                    <p>Summary: {biz.summary}</p>
                    <p>Positive Remarks: {biz.positive_remarks?.join(", ")}</p>
                    {biz.actionable_complaints?.length > 0 && (
                      <div className="pt-1">
                        <p>Actionable Complaints:</p>
                        {biz.actionable_complaints.map((c, i) => (
                          <div key={i} className="pl-4 mt-0.5">
                            <p>{i + 1}. {c.complaint} (Frustration: {c.frustration_intensity})</p>
                            <p className="opacity-60 pl-4 flex gap-2">
                              <span>└</span>
                              <span className="italic">[{c.source_quote}]</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="pt-1">
                      Buying Intent Detected: {biz.buying_intent?.detected ? `Yes - ${biz.buying_intent.explanation}` : "No"}
                    </p>
                  </div>
                </div>
              ))}

              {/* Battle Card View */}
              {response.card && (
                <div className="space-y-4">
                  <h3 className="text-white font-medium underline underline-offset-8 decoration-white/20 mb-6 uppercase tracking-wider text-xs">
                    Competitor Analysis Report: {response.card.competitor_name}
                  </h3>
                  <div className="grid grid-cols-2 gap-8 opacity-80">
                    <div>
                      <p className="text-white/40 mb-1">Market Position</p>
                      <p>{response.card.market_position}</p>
                    </div>
                    <div>
                      <p className="text-white/40 mb-1">Frustration Level</p>
                      <p>{response.card.customer_frustration_level}</p>
                    </div>
                  </div>
                  <div className="pt-4 space-y-4 opacity-80">
                    <div>
                      <p className="text-white/40 mb-2">Key Vulnerabilities</p>
                      {response.card.key_vulnerabilities?.map((v, i) => (
                        <div key={i} className="pl-4 mb-2">
                          <p>{i + 1}. {v.issue}</p>
                          <p className="opacity-60 pl-4 flex gap-2">
                            <span>└</span>
                            <span className="italic">[{v.source_review}]</span>
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white/5 p-4 border-l-2 border-blue-500/50">
                      <p className="text-white/40 mb-1 text-xs uppercase">Strategic Hook</p>
                      <p className="text-blue-300 italic">"{response.card.conversion_strategy_hook}"</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Marketing Content View */}
              {response.content && (
                <div className="bg-white/5 p-6 rounded border border-white/10 opacity-90 leading-relaxed whitespace-pre-wrap">
                  {response.content}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Input Bar (Pinned to Bottom) ── */}
      <div className="w-full max-w-[900px] mx-auto px-6 pb-12">
        <div className="mx-auto" style={{ maxWidth: "600px" }}>
          
          {/* ── Status Logs (Moved here to stay above input) ── */}
          {(logs.length > 0 || loading) && (
            <div className="pb-4 space-y-1">
              {logs.map((log, i) => (
                <div key={i} className={`flex gap-2 ${i === 0 ? "text-blue-400" : "opacity-60 pl-4"}`}>
                  {i > 0 && <span>└</span>}
                  <span>{log.text}</span>
                </div>
              ))}
              
              {loading && (
                <div className="flex items-center gap-3 pt-4 animate-pulse">
                  <div className="w-5 h-5 relative">
                    <div className="absolute inset-0 bg-green-500/20 rounded-full blur-md"></div>
                    <svg viewBox="0 0 24 24" className="w-full h-full text-green-500 fill-current">
                      <path d="M12 2l-10 6v8l10 6 10-6v-8l-10-6zm0 2.5l7.5 4.5-7.5 4.5-7.5-4.5 7.5-4.5z"/>
                    </svg>
                  </div>
                  <span className="text-white text-lg tracking-wide">Cooking ...</span>
                </div>
              )}
            </div>
          )}

          <div
            className="flex items-center gap-3 w-full px-5 py-2"
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.55)",
            }}
          >
            <span
              className="opacity-60"
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
              className="flex-1 bg-transparent outline-none"
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

          <p
            className="mt-3 opacity-30"
            style={{ 
              fontSize: "13px", 
              textAlign: "left" 
            }}
          >
            &gt; Engine: Gemini-3-flash | Context Memory: 15% used | Status: {loading ? "Processing..." : "Optimized"}
          </p>
        </div>
      </div>
    </div>
  );
}