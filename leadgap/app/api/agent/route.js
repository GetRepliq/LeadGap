import {
  classifyMessageIntent,
  enqueueAgentJob,
  runAgentPipeline,
} from "../../../lib/agent-job-service";
import { getCorsHeaders, withCorsJson } from "../../../lib/api-cors";

import { encrypt } from '../../../lib/crypto';
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
  const { message, userId, chatId, history = [], action, apiKey } = body;

  // --- Action: Save/Encrypt API Key ---
  if (action === 'save_key' && userId && apiKey) {
    try {
      const encryptedKey = encrypt(apiKey);
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