import {
  classifyMessageIntent,
  enqueueAgentJob,
  runAgentPipeline,
} from "../../../lib/agent-job-service";

import { encrypt } from '../../../lib/crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_PRIVATE_SERVICE_ROLE
);

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
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500 });
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
      return new Response(
        JSON.stringify({
          jobId: job.id,
          status: job.status,
          intent: intentResult.intent,
        }),
        { status: 202 }
      );
    }

    const syncResult = await runAgentPipeline({
      message,
      userId,
      chatId,
      history,
      intentResult,
    });
    return new Response(JSON.stringify(syncResult), { status: 200 });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}