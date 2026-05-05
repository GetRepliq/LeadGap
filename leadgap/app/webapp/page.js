"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AgentPage() {
  const API_BASE_URL =
    process.env.NEXT_PUBLIC_AGENT_API_BASE_URL?.replace(/\/$/, "") || "";
  const buildApiUrl = (path) => `${API_BASE_URL}${path}`;
  const parseJsonResponse = async (response, contextLabel = "Request") => {
    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();

    if (!rawBody) {
      if (!response.ok) {
        throw new Error(`${contextLabel} failed (${response.status}) with empty response.`);
      }
      return {};
    }

    const looksJson =
      contentType.includes("application/json") ||
      rawBody.trim().startsWith("{") ||
      rawBody.trim().startsWith("[");

    if (!looksJson) {
      const snippet = rawBody.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(
        `${contextLabel} returned non-JSON (${response.status}). Body: ${snippet}`
      );
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      const snippet = rawBody.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(
        `${contextLabel} returned invalid JSON (${response.status}). Body: ${snippet}`
      );
    }
  };

  const [input, setInput] = useState("");
  const [responses, setResponses] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [startTime, setStartTime] = useState(0); 
  const [duration, setDuration] = useState(0); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Auth & Session State ---
  const [user, setUser] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [previousChats, setPreviousChats] = useState([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const router = useRouter();

  // 1. Fetch user session and their chat history
  useEffect(() => {
    const getSessionAndChats = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        fetchChats(session.user.id);
        checkUserProfile(session.user.id);
      }
    };
    getSessionAndChats();
  }, []);

  const checkUserProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('gemini_api_key')
      .eq('id', userId)
      .single();
    
    if (!data?.gemini_api_key) {
      setShowKeyModal(true);
    } else {
      setUserApiKey(data.gemini_api_key);
    }
  };

  const handleSaveKey = async () => {
    if (!userApiKey.trim()) return;
    setLoading(true);

    try {
      const response = await fetch(buildApiUrl('/api/agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'save_key',
          userId: user.id,
          apiKey: userApiKey
        }),
      });

      const data = await parseJsonResponse(response, "Save key request");
      if (data.success) {
        setShowKeyModal(false);
      } else {
        alert("Failed to secure key: " + data.error);
      }
    } catch (e) {
      alert("System error securing link.");
    } finally {
      setLoading(false);
    }
  };

  const fetchChats = async (userId) => {
    const { data, error } = await supabase
      .from('chats')
      .select('id, title, messages, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (!error && data) {
      setPreviousChats(data);
    }
  };

  const loadChat = (chat) => {
    setChatId(chat.id);
    // Reconstruct the 'responses' array from the saved 'messages' history
    // messages: [{role: 'user', content: 'query'}, {role: 'agent', content: {data}}]
    const reconstructed = [];
    for (let i = 0; i < chat.messages.length; i += 2) {
      const userMsg = chat.messages[i];
      const agentMsg = chat.messages[i+1];
      if (userMsg && agentMsg) {
        reconstructed.push({
          ...agentMsg.content,
          query: userMsg.content
        });
      }
    }
    setResponses(reconstructed);
    setLogs([]);
  };

  const startNewChat = () => {
    setChatId(null);
    setResponses([]);
    setLogs([]);
    setInput("");
  };

  const pollJobUntilComplete = async (jobId, timeoutMs = 180000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const res = await fetch(buildApiUrl(`/api/job/${jobId}`));
      const job = await parseJsonResponse(res, "Job status request");
      if (!res.ok) {
        throw new Error(job.error || `Failed to read async job status (${res.status}).`);
      }

      if (job.status === "done") return job.result;
      if (job.status === "failed") {
        throw new Error(job.error_message || "Async job failed.");
      }

      await new Promise((r) => setTimeout(r, 3000));
    }

    throw new Error("Async job timeout. Please retry.");
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    if (!user?.id) {
      setResponses(prev => [...prev, { error: "You must be logged in before running analysis.", query: input }]);
      return;
    }

    const currentInput = input;
    setInput(""); 
    setLoading(true);
    setLogs([]);
    setStartTime(Date.now());

    setLogs([
      { text: `Agent initiated for: "${currentInput}"`, type: "info" },
      { text: "Classifying intent...", type: "step" },
    ]);

    try {
      const historyPayload = responses.map(r => ([
        { role: 'user', content: r.query },
        { role: 'agent', content: r }
      ])).flat();

      const apiResponse = await fetch(buildApiUrl('/api/agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: currentInput,
          userId: user.id ?? null,
          chatId: chatId ?? null,
          history: historyPayload
        }),
      });

      let data = await parseJsonResponse(apiResponse, "Agent request");
      if (!apiResponse.ok && apiResponse.status !== 202) {
        throw new Error(data.error || `Agent request failed (${apiResponse.status}).`);
      }
      const endTime = Date.now();

      if (apiResponse.status === 202 && data?.jobId) {
        setLogs((prev) => [
          ...prev,
          { text: `Queued job ${data.jobId.slice(0, 8)}...`, type: "step" },
          { text: "Background worker processing scrape...", type: "step" },
        ]);
        data = await pollJobUntilComplete(data.jobId);
      }

      if (data.chatId) {
        setChatId(data.chatId);
        if (user) fetchChats(user.id); // Refresh sidebar
      }

      let calculatedDuration = (endTime - Date.now()) / 1000;
      if (startTime > 0) calculatedDuration = (endTime - startTime) / 1000;
      setDuration(Math.abs(calculatedDuration));

      await new Promise(r => setTimeout(r, 600));

      // Agentic Logging logic
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
      
      setResponses(prev => [...prev, { ...data, query: currentInput }]);
    } catch (error) {
      setLogs(prev => [...prev, { text: "Critical Error: Process aborted.", type: "error" }]);
      setResponses(prev => [...prev, { error: error.message, query: currentInput }]);
    } finally {
      setTimeout(() => setLoading(false), 800);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      className="h-screen w-full flex flex-row text-sm overflow-hidden relative"
      style={{
        background: "#0a0a0a",
        color: "rgba(255, 255, 255, 0.7)",
        fontFamily: "var(--font-jetbrains-mono), 'Courier New', monospace",
      }}
    >
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-[240px] border-r border-white/5 flex flex-col bg-[#0a0a0a] transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ letterSpacing: "-0.025em" }}
      >
        <div className="p-6">
          <button 
            onClick={() => {
              startNewChat();
              if (window.innerWidth < 768) setIsSidebarOpen(false);
            }}
            className="w-full border border-white/10 py-2 px-4 text-left hover:bg-white/5 transition-colors opacity-60 hover:opacity-100"
          >
            + New Terminal
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-6">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.05em] opacity-60 px-3 mb-4 mt-2">Previous Nodes</p>
            {previousChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  loadChat(chat);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2 transition-all group relative ${chatId === chat.id ? "text-blue-400 bg-white/5" : "hover:text-white hover:bg-white/[0.02] opacity-40 hover:opacity-100"}`}
              >
                <div className="truncate pr-4 text-[12px]">
                  {chat.title}
                </div>
                {chatId === chat.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-blue-500/50"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-white/5">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase opacity-20">Identity</p>
            <p className="truncate text-white/60">{user ? (user.user_metadata?.full_name || user.email) : "Anonymous"}</p>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Sidebar Toggle Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-6 left-6 z-30 p-2 border border-white/10 hover:bg-white/5 transition-all duration-300 opacity-60 hover:opacity-100 md:hidden"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="flex-1 flex flex-col mx-auto w-full max-w-[800px] px-6 pt-20 md:pt-8 overflow-hidden">
          
          {/* ── Header ── */}
          <div className={`flex flex-col items-center justify-center text-center transition-all duration-700 ease-in-out ${responses.length === 0 && !loading ? 'mt-[10vh] md:mt-[15vh] mb-12' : 'mb-6 scale-90 origin-top'}`}>
            <div className={`transition-all duration-700 ${responses.length === 0 && !loading ? 'mb-8' : 'mb-4'}`}>
              <img 
                src="/glass-logo.png" 
                alt="LeadGap Logo" 
                className={`transition-all duration-700 ${responses.length === 0 && !loading ? 'w-[80px] h-[80px] md:w-[100px] md:h-[100px]' : 'w-[50px] h-[50px] md:w-[65px] md:h-[65px]'}`}
              />
            </div>
            <h1 className={`${responses.length === 0 && !loading ? 'text-xl md:text-2xl' : 'text-lg md:text-xl'} text-white font-semibold transition-all tracking-tighter duration-700`}>
              Terminal v2.0.1
            </h1>
            <p className={`max-w-[480px] opacity-70 font-medium tracking-tight transition-all duration-700 ${responses.length === 0 && !loading ? 'text-xs md:text-sm' : 'text-[10px] md:text-xs'}`}>
              Autonomous intelligence agent ready for command.
            </p>
          </div>

          {/* ── Results Area ── */}
          <div
            className="flex-1 flex flex-col min-h-0"
            style={{ letterSpacing: "-0.035em", lineHeight: "1.3" }}
          >
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide mb-8">
              <div className="space-y-12">
                {responses.map((response, idx) => (
                  <div key={idx} className="space-y-6 border-b border-white/5 pb-10 last:border-0 last:pb-0">
                    <div className="text-white/30 text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                      Input: {response.query}
                    </div>
                    
                    {response.error && (
                      <div className="text-red-400/90 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
                        {response.error}
                      </div>
                    )}

                    {/* Market Analysis View */}
                    {response.rawJson?.businesses?.map((biz, bIdx) => (
                      <div key={bIdx} className="space-y-1">
                        <h3 className="text-white font-medium">{bIdx + 1}. Business: {biz.business_name}</h3>
                        <div className="pl-5 space-y-0.5 opacity-80">
                          <p>Summary: {biz.summary}</p>
                          <p>Positive Remarks: {(Array.isArray(biz.positive_remarks) ? biz.positive_remarks : []).join(", ")}</p>
                          {biz.actionable_complaints?.length > 0 && (
                            <div className="pt-1">
                              <p>Actionable Complaints:</p>
                              {biz.actionable_complaints.map((c, i) => (
                                <div key={i} className="pl-4 mt-0.5">
                                  <p>{i + 1}. {c.complaint} (Frustration: {c.frustration_intensity})</p>
                                  <p className="opacity-60 pl-4 flex gap-2"><span>└</span><span className="italic">[{c.source_quote}]</span></p>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="pt-1">Buying Intent Detected: {biz.buying_intent?.detected ? `Yes - ${biz.buying_intent.explanation}` : "No"}</p>
                        </div>
                      </div>
                    ))}

                    {/* Battle Card View */}
                    {response.card && (
                      <div className="space-y-4">
                        <h3 className="text-white font-medium underline underline-offset-8 decoration-white/20 mb-6 uppercase tracking-wider text-xs">
                          Competitor Analysis Report: {response.card.competitor_name}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 opacity-80">
                          <div><p className="text-white/40 mb-1">Market Position</p><p>{response.card.market_position}</p></div>
                          <div><p className="text-white/40 mb-1">Frustration Level</p><p>{response.card.customer_frustration_level}</p></div>
                        </div>
                        <div className="pt-4 space-y-4 opacity-80">
                          <div>
                            <p className="text-white/40 mb-2">Key Vulnerabilities</p>
                            {response.card.key_vulnerabilities?.map((v, i) => (
                              <div key={i} className="pl-4 mb-2">
                                <p>{i + 1}. {v.issue}</p>
                                <p className="opacity-60 pl-4 flex gap-2"><span>└</span><span className="italic">[{v.source_review}]</span></p>
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
                        <div className="bg-white/5 p-6 rounded border border-white/10 opacity-90 leading-relaxed whitespace-pre-wrap">
                          {response.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {/* ── Status Logs ── */}
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

        {/* ── Input Bar ── */}
        <div className="w-full max-w-[800px] mx-auto px-6 pb-6 md:pb-12 flex-shrink-0">
          <div className="flex items-center gap-3 w-full px-4 py-2 bg-transparent border border-white/20">
            <span className="opacity-60 text-sm">→</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={loading ? "Thinking..." : "Analyze Cafes in London ..."}
              className="flex-1 bg-transparent outline-none text-white/80"
              disabled={loading}
            />
          </div>
          <p className="mt-3 opacity-30 text-[11px] md:text-[13px]">
            &gt; Engine: Gemini-3-flash | Status: {loading ? "Processing..." : "Optimized"}
          </p>
        </div>
      </div>

      {/* ── Key Setup Modal ── */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-[400px] bg-[#0a0a0a] border border-white/10 p-8 space-y-6 shadow-2xl" style={{ letterSpacing: "-0.025em" }}>
            <div className="space-y-2">
              <h2 className="text-xl text-white font-medium">Terminal Activation</h2>
              <p className="text-xs opacity-50 leading-relaxed">
                To enable autonomous intelligence, provide your Gemini API key. This will be stored securely in your private profile.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase opacity-40 pl-2">Gemini API Key</label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-2 outline-none focus:border-white/50 text-white transition-colors text-sm"
              />
            </div>

            <button
              onClick={handleSaveKey}
              className="w-full bg-white text-black py-2 font-medium hover:bg-white/90 transition-colors text-sm"
            >
              Establish Link
            </button>
            
            <p className="text-[9px] opacity-20 text-center uppercase tracking-widest pt-4">
              LeadGap Security Protocol v4.0.2
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
