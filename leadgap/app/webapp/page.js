"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";

function StatusBanner({ variant = "error", title, children }) {
  const styles = {
    error: "text-red-400/90 border-red-500/30 bg-red-500/10",
    warning: "text-amber-400/90 border-amber-500/30 bg-amber-500/10",
    info: "text-blue-300/90 border-blue-500/30 bg-blue-500/10",
  };

  return (
    <div className={`border px-4 py-3 text-sm space-y-1 ${styles[variant] || styles.error}`}>
      {title && <p className="text-[10px] uppercase tracking-widest opacity-70">{title}</p>}
      <p>{children}</p>
    </div>
  );
}

function hasRenderableContent(response) {
  return Boolean(
    response?.rawJson?.businesses?.length ||
    response?.card ||
    response?.content ||
    response?.formattedContent ||
    response?.message
  );
}

function normalizeAgentResponse(data) {
  const normalized = { ...data };

  if (normalized.intent === "error" && normalized.detail && !normalized.error) {
    normalized.error = normalized.detail;
  }

  if (normalized.error) return normalized;

  if (!hasRenderableContent(normalized)) {
    normalized.error =
      "The agent finished without displayable results. Verify your Gemini API key and that GOOGLE_PLACES_API_KEY is set on the server, then retry.";
  }

  return normalized;
}

export default function AgentPage() {
  const resolveApiBaseUrl = useCallback(() => {
    const fromEnv = process.env.NEXT_PUBLIC_AGENT_API_BASE_URL?.replace(/\/$/, "");
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, []);

  const buildApiUrl = useCallback(
    (path) => `${resolveApiBaseUrl()}${path}`,
    [resolveApiBaseUrl]
  );

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

  const appendLog = (entry) => {
    setLogs((prev) => [...prev, entry]);
  };

  const [input, setInput] = useState("");
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [user, setUser] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [previousChats, setPreviousChats] = useState([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [keySaveError, setKeySaveError] = useState("");

  useEffect(() => {
    const getSessionAndChats = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        fetchChats(session.user.id);
        checkUserProfile(session.user.id);
      }
    };
    getSessionAndChats();
  }, []);

  useEffect(() => {
    if (!loading || !startTime) return undefined;

    const tick = setInterval(() => {
      setDuration((Date.now() - startTime) / 1000);
    }, 200);

    return () => clearInterval(tick);
  }, [loading, startTime]);

  const checkUserProfile = async (userId) => {
    const { data } = await supabase
      .from("profiles")
      .select("gemini_api_key")
      .eq("id", userId)
      .single();

    if (!data?.gemini_api_key) {
      setShowKeyModal(true);
    }
  };

  const handleSaveKey = async () => {
    if (!userApiKey.trim()) return;
    setLoading(true);
    setKeySaveError("");

    try {
      const response = await fetch(buildApiUrl("/api/agent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_key",
          userId: user.id,
          apiKey: userApiKey.trim(),
        }),
      });

      const data = await parseJsonResponse(response, "Save key request");
      if (data.success) {
        setUserApiKey("");
        setShowKeyModal(false);
      } else {
        setKeySaveError(data.error || "Failed to save API key.");
      }
    } catch (error) {
      setKeySaveError(error.message || "System error securing link.");
    } finally {
      setLoading(false);
    }
  };

  const fetchChats = async (userId) => {
    const { data, error } = await supabase
      .from("chats")
      .select("id, title, messages, created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setPreviousChats(data);
    }
  };

  const loadChat = (chat) => {
    setChatId(chat.id);
    const reconstructed = [];
    for (let i = 0; i < chat.messages.length; i += 2) {
      const userMsg = chat.messages[i];
      const agentMsg = chat.messages[i + 1];
      if (userMsg && agentMsg) {
        reconstructed.push({
          ...agentMsg.content,
          query: userMsg.content,
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

  const pollJobUntilComplete = async (jobId, intent, timeoutMs = 180000) => {
    const startedAt = Date.now();
    let lastStatus = null;
    let pollCount = 0;

    while (Date.now() - startedAt < timeoutMs) {
      pollCount += 1;
      const res = await fetch(buildApiUrl(`/api/job/${jobId}`));
      const job = await parseJsonResponse(res, "Job status request");

      if (!res.ok) {
        throw new Error(job.error || `Failed to read job status (${res.status}).`);
      }

      if (job.status !== lastStatus) {
        lastStatus = job.status;
        if (job.status === "pending") {
          appendLog({ text: "Job queued — waiting for worker...", type: "step" });
        } else if (job.status === "processing") {
          appendLog({ text: "Worker active — fetching reviews via Google Places API...", type: "step" });
        }
      } else if (pollCount > 1) {
        appendLog({
          text: `Still ${job.status || "running"}... (${Math.round((Date.now() - startedAt) / 1000)}s)`,
          type: "step",
        });
      }

      if (job.status === "done") {
        if (job.result?.error) {
          throw new Error(job.result.error);
        }
        if (intent === "extract_reviews") {
          appendLog({ text: "Places API data received — running LLM synthesis...", type: "step" });
        } else if (intent === "competitor_analysis") {
          appendLog({ text: "Competitor profile loaded — generating battle card...", type: "step" });
        }
        return job.result;
      }

      if (job.status === "failed") {
        throw new Error(
          job.error_message || job.result?.error || "Background job failed."
        );
      }

      await new Promise((r) => setTimeout(r, 2500));
    }

    throw new Error(
      "Job timed out after 3 minutes. Ensure the background worker is running (see ASYNC_JOBS_SETUP.md)."
    );
  };

  const handleSubmit = async () => {
    if (!input.trim() || loading) return;

    if (!user?.id) {
      setResponses((prev) => [
        ...prev,
        { error: "You must be logged in before running analysis.", query: input },
      ]);
      return;
    }

    const currentInput = input;
    setInput("");
    setLoading(true);
    setLogs([]);
    setDuration(0);
    setStartTime(Date.now());

    appendLog({ text: `Agent initiated for: "${currentInput}"`, type: "info" });
    appendLog({ text: "Classifying intent via Gemini...", type: "step" });

    try {
      const agentUrl = buildApiUrl("/api/agent");
      appendLog({
        text: `POST ${agentUrl} (LeadGap API → Google Places)`,
        type: "step",
      });

      const historyPayload = responses
        .map((r) => [
          { role: "user", content: r.query },
          { role: "agent", content: r },
        ])
        .flat();

      const apiResponse = await fetch(agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: currentInput,
          userId: user.id ?? null,
          chatId: chatId ?? null,
          history: historyPayload,
        }),
      });

      let data = await parseJsonResponse(apiResponse, "Agent request");

      if (!apiResponse.ok && apiResponse.status !== 202) {
        throw new Error(data.error || `Agent request failed (${apiResponse.status}).`);
      }

      if (apiResponse.status === 202) {
        if (!data?.jobId) {
          throw new Error("Server accepted the job but returned no jobId.");
        }

        const intent = data.intent || "extract_reviews";
        appendLog({
          text: `Intent: ${intent.replace(/_/g, " ")} — job ${data.jobId.slice(0, 8)}...`,
          type: "step",
        });
        appendLog({ text: "Polling job status until complete...", type: "step" });

        data = await pollJobUntilComplete(data.jobId, intent);
      } else {
        appendLog({ text: `Synchronous response (${apiResponse.status})`, type: "step" });
      }

      if (data.chatId) {
        setChatId(data.chatId);
        fetchChats(user.id);
      }

      const normalized = normalizeAgentResponse(data);

      if (normalized.error) {
        appendLog({ text: `Error: ${normalized.error}`, type: "error" });
      } else {
        appendLog({ text: "Response ready.", type: "info" });
      }

      setDuration((Date.now() - startTime) / 1000);
      setResponses((prev) => [...prev, { ...normalized, query: currentInput }]);
    } catch (error) {
      appendLog({ text: `Critical error: ${error.message}`, type: "error" });
      setDuration((Date.now() - startTime) / 1000);
      setResponses((prev) => [
        ...prev,
        { error: error.message, query: currentInput },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSubmit();
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
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

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
            <p className="text-[10px] uppercase tracking-[0.05em] opacity-60 px-3 mb-4 mt-2">
              Previous Nodes
            </p>
            {previousChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  loadChat(chat);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2 transition-all group relative ${chatId === chat.id ? "text-blue-400 bg-white/5" : "hover:text-white hover:bg-white/[0.02] opacity-40 hover:opacity-100"}`}
              >
                <div className="truncate pr-4 text-[12px]">{chat.title}</div>
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
            <p className="truncate text-white/60">
              {user ? user.user_metadata?.full_name || user.email : "Anonymous"}
            </p>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-6 left-6 z-30 p-2 border border-white/10 hover:bg-white/5 transition-all duration-300 opacity-60 hover:opacity-100 md:hidden"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <div className="flex-1 flex flex-col mx-auto w-full max-w-[800px] px-6 pt-20 md:pt-8 overflow-hidden">
          <div
            className={`flex flex-col items-center justify-center text-center transition-all duration-700 ease-in-out ${responses.length === 0 && !loading ? "mt-[10vh] md:mt-[15vh] mb-12" : "mb-6 scale-90 origin-top"}`}
          >
            <div
              className={`transition-all duration-700 ${responses.length === 0 && !loading ? "mb-8" : "mb-4"}`}
            >
              <img
                src="/glass-logo.png"
                alt="LeadGap Logo"
                className={`transition-all duration-700 ${responses.length === 0 && !loading ? "w-[80px] h-[80px] md:w-[100px] md:h-[100px]" : "w-[50px] h-[50px] md:w-[65px] md:h-[65px]"}`}
              />
            </div>
            <h1
              className={`${responses.length === 0 && !loading ? "text-xl md:text-2xl" : "text-lg md:text-xl"} text-white font-semibold transition-all tracking-tighter duration-700`}
            >
              Terminal v2.0.1
            </h1>
            <p
              className={`max-w-[480px] opacity-70 font-medium tracking-tight transition-all duration-700 ${responses.length === 0 && !loading ? "text-xs md:text-sm" : "text-[10px] md:text-xs"}`}
            >
              Autonomous intelligence agent ready for command.
            </p>
          </div>

          <div
            className="flex-1 flex flex-col min-h-0"
            style={{ letterSpacing: "-0.035em", lineHeight: "1.3" }}
          >
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide mb-8">
              <div className="space-y-12">
                {responses.map((response, idx) => (
                  <div
                    key={idx}
                    className="space-y-6 border-b border-white/5 pb-10 last:border-0 last:pb-0"
                  >
                    <div className="text-white/30 text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                      Input: {response.query}
                    </div>

                    {response.error && (
                      <StatusBanner variant="error" title="Agent Error">
                        {response.error}
                      </StatusBanner>
                    )}

                    {response.detail && !response.error && (
                      <StatusBanner variant="warning" title="Notice">
                        {response.detail}
                      </StatusBanner>
                    )}

                    {response.message && !response.error && (
                      <StatusBanner variant="info" title="Agent">
                        {response.message}
                      </StatusBanner>
                    )}

                    {response.rawJson?.businesses?.map((biz, bIdx) => (
                      <div key={bIdx} className="space-y-1">
                        <h3 className="text-white font-medium">
                          {bIdx + 1}. Business: {biz.business_name}
                        </h3>
                        <div className="pl-5 space-y-0.5 opacity-80">
                          <p>Summary: {biz.summary}</p>
                          <p>
                            Positive Remarks:{" "}
                            {(Array.isArray(biz.positive_remarks)
                              ? biz.positive_remarks
                              : []
                            ).join(", ")}
                          </p>
                          {biz.actionable_complaints?.length > 0 && (
                            <div className="pt-1">
                              <p>Actionable Complaints:</p>
                              {biz.actionable_complaints.map((c, i) => (
                                <div key={i} className="pl-4 mt-0.5">
                                  <p>
                                    {i + 1}. {c.complaint} (Frustration:{" "}
                                    {c.frustration_intensity})
                                  </p>
                                  <p className="opacity-60 pl-4 flex gap-2">
                                    <span>└</span>
                                    <span className="italic">[{c.source_quote}]</span>
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="pt-1">
                            Buying Intent Detected:{" "}
                            {biz.buying_intent?.detected
                              ? `Yes - ${biz.buying_intent.explanation}`
                              : "No"}
                          </p>
                        </div>
                      </div>
                    ))}

                    {response.card && (
                      <div className="space-y-4">
                        <h3 className="text-white font-medium underline underline-offset-8 decoration-white/20 mb-6 uppercase tracking-wider text-xs">
                          Competitor Analysis Report: {response.card.competitor_name}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 opacity-80">
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
                                <p>
                                  {i + 1}. {v.issue}
                                </p>
                                <p className="opacity-60 pl-4 flex gap-2">
                                  <span>└</span>
                                  <span className="italic">[{v.source_review}]</span>
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="bg-white/5 p-4 border-l-2 border-blue-500/50">
                            <p className="text-white/40 mb-1 text-xs uppercase">
                              Strategic Hook
                            </p>
                            <p className="text-blue-300 italic">
                              &quot;{response.card.conversion_strategy_hook}&quot;
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {(response.content || response.formattedContent) && (
                      <div className="space-y-4">
                        <div className="bg-white/5 p-6 rounded border border-white/10 opacity-90 leading-relaxed whitespace-pre-wrap">
                          {response.content || response.formattedContent}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {(logs.length > 0 || loading) && (
                  <div
                    className="pt-4 pb-8 space-y-1"
                    style={{ letterSpacing: "-0.045em", lineHeight: "1.3" }}
                  >
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 pl-4 ${
                          log.type === "error"
                            ? "text-red-400"
                            : i === 0
                              ? "text-blue-400 pl-0"
                              : "opacity-100"
                        }`}
                      >
                        {i > 0 && <span>└</span>}
                        <span>{log.text}</span>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex items-center gap-3 pt-4 animate-pulse pl-4">
                        <div className="w-5 h-5 relative">
                          <div className="absolute inset-0 bg-green-500/20 rounded-full blur-md"></div>
                          <svg
                            viewBox="0 0 24 24"
                            className="w-full h-full text-green-500 fill-current"
                          >
                            <path d="M12 2l-10 6v8l10 6 10-6v-8l-10-6zm0 2.5l7.5 4.5-7.5 4.5-7.5-4.5 7.5-4.5z" />
                          </svg>
                        </div>
                        <span className="text-white text-lg tracking-tight">
                          Processing
                          {duration > 0 ? ` (${formatDuration(duration)})` : "..."}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-[800px] mx-auto px-6 pb-6 md:pb-12 flex-shrink-0">
          <div className="flex items-center gap-3 w-full px-4 py-2 bg-transparent border border-white/20">
            <span className="opacity-60 text-sm">→</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={loading ? "Processing..." : "Analyze Cafes in London ..."}
              className="flex-1 bg-transparent outline-none text-white/80"
              disabled={loading}
            />
          </div>
          <p className="mt-3 opacity-30 text-[11px] md:text-[13px]">
            &gt; Engine: Gemini-flash | Reviews: Google Places API | Status:{" "}
            {loading ? "Processing..." : "Ready"}
          </p>
        </div>
      </div>

      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div
            className="w-full max-w-[400px] bg-[#0a0a0a] border border-white/10 p-8 space-y-6 shadow-2xl"
            style={{ letterSpacing: "-0.025em" }}
          >
            <div className="space-y-2">
              <h2 className="text-xl text-white font-medium">Terminal Activation</h2>
              <p className="text-xs opacity-50 leading-relaxed">
                Use a key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400/80 underline"
                >
                  Google AI Studio
                </a>
                . It is validated live before being encrypted and stored in your profile.
              </p>
            </div>

            {keySaveError && (
              <StatusBanner variant="error" title="Key Rejected">
                {keySaveError}
              </StatusBanner>
            )}

            <div className="space-y-1">
              <label className="text-[10px] uppercase opacity-40 pl-2">
                Gemini API Key
              </label>
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
