"use client";

import { useState, useEffect } from "react";

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [responses, setResponses] = useState([]); // Changed to array to persist history
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [startTime, setStartTime] = useState(0); 
  const [duration, setDuration] = useState(0); 

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    // Removed setResponse(null) to keep previous responses
    setLogs([]);
    const currentInput = input;
    setInput(""); // Clear input after submission

    setLogs([
      { text: `Agent initiated for: "${currentInput}"`, type: "info" },
      { text: "Classifying intent...", type: "step" },
    ]);

    try {
      const apiResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput }),
      });

      const data = await apiResponse.json();
      const endTime = Date.now();
      
      let calculatedDuration = 0; // Default to 0 for safety

      // Ensure startTime is a valid number, greater than 0 (epoch start is 0),
      // and endTime is later than startTime.
      if (startTime !== null && typeof startTime === 'number' && startTime > 0 && endTime > startTime) {
          const elapsed = endTime - startTime;
          const totalDurationSeconds = elapsed / 1000;
          
          // Ensure the calculated duration is a finite, non-negative number
          if (isFinite(totalDurationSeconds) && totalDurationSeconds >= 0) {
              calculatedDuration = totalDurationSeconds;
          }
      } else {
          // Log a warning if timing is invalid for debugging purposes
          console.warn("Invalid start/end time for duration calculation. Resetting duration. startTime:", startTime, "endTime:", endTime);
          calculatedDuration = 0; // Reset to 0 if invalid
      }
      
      setDuration(calculatedDuration);

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
      
      // Append the original query to the response for context in the history
      setResponses(prev => [...prev, { ...data, query: currentInput }]);
    } catch (error) {
      setLogs(prev => [...prev, { text: "Critical Error: Process aborted.", type: "error" }]);
      setResponses(prev => [...prev, { error: error.message, query: currentInput }]);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      setStartTime(Date.now());
      handleSubmit();
    }
  };

  // Helper to format duration
  const formatDuration = (seconds) => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      className="h-screen w-full flex flex-col text-sm overflow-hidden"
      style={{
        background: "#0a0a0a",
        color: "rgba(255, 255, 255, 0.7)",
        fontFamily: "var(--font-jetbrains-mono), 'Courier New', monospace",
      }}
    >
      <div className="flex-1 flex flex-col mx-auto w-full max-w-[900px] px-6 pt-8 overflow-hidden">
        
        {/* ── Header ── */}
        <div className={`flex flex-col items-center justify-center text-center transition-all duration-700 ease-in-out ${responses.length === 0 && !loading ? 'mb-12' : 'mb-6 scale-90 origin-top'}`}>
          <div className={`transition-all duration-700 ${responses.length === 0 && !loading ? 'mb-8' : 'mb-4'}`}>
            <img 
              src="/White-Logo.svg" 
              alt="LeadGap Logo" 
              className={`transition-all duration-700 ${responses.length === 0 && !loading ? 'w-[60px] h-[60px]' : 'w-[40px] h-[40px]'}`}
            />
          </div>
          <p className={`${responses.length === 0 && !loading ? 'text-2xl' : 'text-xl'} mb-1 opacity-80 font-medium transition-all duration-700`}>Hi Dean Winchester</p>
          <h1 className={`${responses.length === 0 && !loading ? 'text-2xl' : 'text-xl'} text-white font-semibold transition-all duration-700 ${responses.length === 0 && !loading ? 'mb-6' : 'mb-2'}`}>Can I help you with anything?</h1>
          <p className={`max-w-[480px] opacity-70 font-medium transition-all duration-700 ${responses.length === 0 && !loading ? 'text-sm' : 'text-xs'}`}>
            I&apos;m ready to analyze market reviews, identify competitor weaknesses, and build your winning strategy.
          </p>
        </div>

        {/* ── Results Area ── */}
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ letterSpacing: "-0.035em", lineHeight: "1.3" }}
        >
          <div className="flex-1 overflow-y-auto pr-2 [-webkit-overflow-scrolling:touch] scrollbar-hide mb-8">
            <div className="space-y-12">
              {responses.map((response, idx) => (
                <div key={idx} className="space-y-6 border-b border-white/5 pb-10 last:border-0 last:pb-0">
                  <div className="text-white/30 text-[10px] uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                    Query: {response.query}
                  </div>
                  
                  {/* Market Analysis View */}
                  {response.rawJson?.businesses?.map((biz, bIdx) => (
                    <div key={bIdx} className="space-y-1">
                      <h3 className="text-white font-medium">
                        {bIdx + 1}. Business: {biz.business_name}
                      </h3>
                      <div className="pl-5 space-y-0.5 opacity-80">
                        <p>Summary: {biz.summary}</p>
                        <p>Positive Remarks: {(Array.isArray(biz.positive_remarks) ? biz.positive_remarks : []).join(", ")}</p>
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
                          <p className="text-blue-300 italic">&quot;{response.card.conversion_strategy_hook}&quot;</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Marketing Content View */}
                  {response.content && (
                    <div className="space-y-4">
                      {response.formattedContent ? (
                        <div 
                          dangerouslySetInnerHTML={{ __html: response.formattedContent }} 
                        />
                      ) : (
                        <div className="bg-white/5 p-6 rounded border border-white/10 opacity-90 leading-relaxed whitespace-pre-wrap">
                          {response.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {/* ── Status Logs (Now inside scrollable area) ── */}
              {(logs.length > 0 || loading) && (
                <div className="pt-4 pb-8 space-y-1" style={{ letterSpacing: "-0.045em", lineHeight: "1.3" }}>
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${i === 0 ? "text-blue-400" : "opacity-100 pl-4"}`}>
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
                      <span className="text-white text-lg tracking-tight">Cooking ... {duration > 0 && `(${formatDuration(duration)})`}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Input Bar (Pinned to Bottom) ── */}
      <div className="w-full max-w-[900px] mx-auto px-6 pb-12 flex-shrink-0">
        <div className="mx-auto" style={{ maxWidth: "800px" }}>
          <div
            className="flex items-center gap-3 w-full px-4 py-2"
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