import { classifyIntent, analyzeReviews, analyzeCompetitor, generateMarketingContent, updateMemory, scrapeReviews, formatGeneratedContent, saveChat } from '../../../lib/agent-functions';
import { encrypt, decrypt } from '../../../lib/crypto';
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

  // --- Main Chat Logic ---
  console.log('Received message:', message);

  try {
    // 1. Fetch and Decrypt User's API Key
    let activeApiKey = process.env.GEMINI_API_KEY; // Fallback

    if (userId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('gemini_api_key')
        .eq('id', userId)
        .single();

      if (profile?.gemini_api_key) {
        try {
          activeApiKey = decrypt(profile.gemini_api_key);
        } catch (e) {
          console.error("Failed to decrypt user API key, using fallback.");
        }
      }
    }

    // 2. Classify Intent
    const intentResult = await classifyIntent(message, activeApiKey);
    console.log('Intent Classified:', intentResult);

    let agentResponse;

    // 3. Process Intent (Passing the activeApiKey to all functions)
    switch (intentResult.intent) {
      case 'extract_reviews':
        console.log('Intent: extract_reviews - Initiating scraping...');
        const query = intentResult.searchQuery || message;
        const scrapedNicheReviews = await scrapeReviews({
          searchQuery: query,
          mode: "niche",
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

      case 'competitor_analysis':
        // Safety check: If AI classified as competitor but didn't provide a name, downgrade to niche search
        if (!intentResult.competitorName) {
          console.warn('Competitor analysis requested but name missing. Downgrading to extract_reviews.');
          const fallbackQuery = intentResult.searchQuery || message;
          const fallbackReviews = await scrapeReviews({ searchQuery: fallbackQuery, mode: "niche" });
          agentResponse = fallbackReviews.error ? { error: fallbackReviews.error } : await analyzeReviews(fallbackReviews, activeApiKey);
          break;
        }

        console.log(`Intent: competitor_analysis for ${intentResult.competitorName}`);
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

      case 'generate_content':
        if (!intentResult.contentRequest) {
          agentResponse = { error: "Please specify what content you'd like to generate." };
        } else {
          const contentData = await generateMarketingContent(intentResult.contentRequest, activeApiKey);
          agentResponse = contentData.error ? contentData : {
            content: contentData.content,
            formattedContent: formatGeneratedContent(contentData.content),
            intent: 'generate_content'
          };
        }
        break;
      case 'other':
      default:
        agentResponse = { ...intentResult, message: "Hello! How can I help you today?" };
        break;
    }

    // 4. Persist to Supabase
    let savedChat = null;
    if (userId) {
      const updatedHistory = [
        ...history,
        { role: 'user', content: message },
        { role: 'agent', content: agentResponse }
      ];
      const title = history.length === 0 ? message.substring(0, 40) : null;
      savedChat = await saveChat({ userId, chatId, title, messages: updatedHistory });
    }

    return new Response(JSON.stringify({
      ...agentResponse,
      chatId: savedChat?.id || chatId
    }), { status: 200 });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}