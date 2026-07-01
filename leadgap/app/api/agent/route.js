import {
  classifyMessageIntent,
  enqueueAgentJob,
  runAgentPipeline,
} from "../../../lib/agent-job-service";
import { getCorsHeaders, withCorsJson } from "../../../lib/api-cors";

import { encrypt } from '../../../lib/crypto';
import { isValidGeminiKeyFormat, normalizeGeminiApiKey, validateGeminiApiKey } from '../../../lib/gemini-api-key';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_PRIVATE_SERVICE_ROLE
);

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request) {
  const body = await request.json();
  const { message, history = [], action, apiKey } = body;

  // Normalize IDs: treat undefined, null, or the string "undefined" as null
  const userId = (body.userId === undefined || body.userId === null || body.userId === "undefined") ? null : body.userId;
  const chatId = (body.chatId === undefined || body.chatId === null || body.chatId === "undefined") ? null : body.chatId;

  // --- Action: Save/Encrypt API Key ---
  if (action === 'save_key' && userId && apiKey) {
    try {
      const normalizedKey = normalizeGeminiApiKey(apiKey);
      if (!isValidGeminiKeyFormat(normalizedKey)) {
        return withCorsJson(
          request,
          { error: "Invalid key format. Paste a Google AI Studio key that starts with AIza." },
          400
        );
      }

      const validation = await validateGeminiApiKey(normalizedKey);
      if (!validation.valid) {
        return withCorsJson(request, { error: validation.error }, 400);
      }

      const encryptedKey = encrypt(normalizedKey);
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ gemini_api_key: encryptedKey })
        .eq('id', userId);

      if (error) throw error;
      return withCorsJson(request, { success: true }, 200);
    } catch (e) {
      return withCorsJson(request, { error: e.message }, 500);
    }
  }

  try {
    const { intentResult } = await classifyMessageIntent({ message, userId });
    const asyncIntents = ["extract_reviews", "competitor_analysis"];

    if (asyncIntents.includes(intentResult.intent)) {
      const job = await enqueueAgentJob({
        message,
        userId,
        chatId,
        history,
        intentResult,
      });
      return withCorsJson(
        request,
        {
          jobId: job.id,
          status: job.status,
          intent: intentResult.intent,
        },
        202
      );
    }

    const syncResult = await runAgentPipeline({
      message,
      userId,
      chatId,
      history,
      intentResult,
    });
    return withCorsJson(request, syncResult, 200);

  } catch (error) {
    console.error('API Error:', error);
    return withCorsJson(request, { error: error.message }, 500);
  }
}