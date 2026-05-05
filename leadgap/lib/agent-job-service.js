import { createClient } from "@supabase/supabase-js";
import {
  classifyIntent,
  analyzeReviews,
  analyzeCompetitor,
  generateMarketingContent,
  updateMemory,
  scrapeReviews,
  formatGeneratedContent,
  saveChat,
} from "./agent-functions";
import { decrypt } from "./crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_PRIVATE_SERVICE_ROLE
);

async function getActiveApiKey(userId) {
  let activeApiKey = process.env.GEMINI_API_KEY;

  if (!userId) return activeApiKey;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("gemini_api_key")
    .eq("id", userId)
    .single();

  if (profile?.gemini_api_key) {
    try {
      activeApiKey = decrypt(profile.gemini_api_key);
    } catch (e) {
      console.error("Failed to decrypt user API key, using fallback.");
    }
  }

  return activeApiKey;
}

export async function classifyMessageIntent({ message, userId }) {
  const activeApiKey = await getActiveApiKey(userId);
  const intentResult = await classifyIntent(message, activeApiKey);
  return { intentResult, activeApiKey };
}

export async function enqueueAgentJob(payload) {
  const { data, error } = await supabaseAdmin
    .from("agent_jobs")
    .insert([
      {
        status: "pending",
        payload,
      },
    ])
    .select("id, status")
    .single();

  if (error) throw error;
  return data;
}

export async function getAgentJob(jobId) {
  const { data, error } = await supabaseAdmin
    .from("agent_jobs")
    .select("id, status, result, error_message, created_at, updated_at")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data;
}

export async function runAgentPipeline({
  message,
  userId,
  chatId,
  history = [],
  intentResult,
}) {
  const activeApiKey = await getActiveApiKey(userId);
  let agentResponse;

  switch (intentResult.intent) {
    case "extract_reviews": {
      const query = intentResult.searchQuery || message;
      const scrapedNicheReviews = await scrapeReviews({
        searchQuery: query,
        mode: "niche",
        location: intentResult.location,
      });

      if (scrapedNicheReviews.error) {
        agentResponse = { error: `Scraping error: ${scrapedNicheReviews.error}` };
      } else {
        agentResponse = await analyzeReviews(scrapedNicheReviews, activeApiKey);
        if (agentResponse && agentResponse.rawJson) {
          await updateMemory(agentResponse.rawJson, query, activeApiKey);
        }
      }
      break;
    }
    case "competitor_analysis": {
      if (!intentResult.competitorName) {
        const fallbackQuery = intentResult.searchQuery || message;
        const fallbackReviews = await scrapeReviews({
          searchQuery: fallbackQuery,
          mode: "niche",
          location: intentResult.location,
        });
        agentResponse = fallbackReviews.error
          ? { error: fallbackReviews.error }
          : await analyzeReviews(fallbackReviews, activeApiKey);
        break;
      }

      const scrapedCompetitorData = await scrapeReviews({
        searchQuery: intentResult.competitorName,
        mode: "competitor",
        competitorName: intentResult.competitorName,
        location: intentResult.location || "unknown location",
      });

      if (scrapedCompetitorData.error) {
        agentResponse = { error: `Scraping error: ${scrapedCompetitorData.error}` };
      } else {
        agentResponse = await analyzeCompetitor(scrapedCompetitorData, activeApiKey);
      }
      break;
    }
    case "generate_content": {
      if (!intentResult.contentRequest) {
        agentResponse = { error: "Please specify what content you'd like to generate." };
      } else {
        const contentData = await generateMarketingContent(
          intentResult.contentRequest,
          activeApiKey
        );
        agentResponse = contentData.error
          ? contentData
          : {
              content: contentData.content,
              formattedContent: formatGeneratedContent(contentData.content),
              intent: "generate_content",
            };
      }
      break;
    }
    case "other":
    default:
      agentResponse = { ...intentResult, message: "Hello! How can I help you today?" };
      break;
  }

  let savedChat = null;
  if (userId) {
    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "agent", content: agentResponse },
    ];
    const title = history.length === 0 ? message.substring(0, 40) : null;
    savedChat = await saveChat({ userId, chatId, title, messages: updatedHistory });
  }

  return {
    ...agentResponse,
    chatId: savedChat?.id || chatId,
    intent: intentResult.intent,
  };
}

export async function processNextQueuedJob() {
  const { data: pendingJobs, error: pendingErr } = await supabaseAdmin
    .from("agent_jobs")
    .select("id, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (pendingErr) throw pendingErr;
  if (!pendingJobs?.length) return { processed: false };

  const job = pendingJobs[0];

  const { data: lockedJob, error: lockErr } = await supabaseAdmin
    .from("agent_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id, payload")
    .single();

  if (lockErr || !lockedJob) {
    return { processed: false };
  }

  try {
    const result = await runAgentPipeline(lockedJob.payload);
    const { error: doneErr } = await supabaseAdmin
      .from("agent_jobs")
      .update({
        status: "done",
        result,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", lockedJob.id);

    if (doneErr) throw doneErr;
    return { processed: true, jobId: lockedJob.id, status: "done" };
  } catch (error) {
    await supabaseAdmin
      .from("agent_jobs")
      .update({
        status: "failed",
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", lockedJob.id);

    return {
      processed: true,
      jobId: lockedJob.id,
      status: "failed",
      error: error.message,
    };
  }
}
