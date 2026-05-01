import { classifyIntent, analyzeReviews, analyzeCompetitor, generateMarketingContent, updateMemory, scrapeReviews, formatGeneratedContent, saveChat } from '../../../lib/agent-functions';


export async function POST(request) {
  const { message, userId, chatId, history = [] } = await request.json();
  console.log('Received message:', message);

  try {
    const intentResult = await classifyIntent(message);
    console.log('Intent Classified:', intentResult);

    let agentResponse;

    switch (intentResult.intent) {
      case 'extract_reviews':
        console.log('Intent: extract_reviews - Initiating scraping...');
        const scrapedNicheReviews = await scrapeReviews({
          searchQuery: intentResult.searchQuery,
          mode: "niche",
        });

        if (scrapedNicheReviews.error) {
          agentResponse = { error: `Scraping error: ${scrapedNicheReviews.error}` };
        } else if (scrapedNicheReviews.length === 0) {
          agentResponse = { message: "No reviews found for the specified niche. Please try a different search query." };
        } else {
          console.log(`Scraped ${scrapedNicheReviews.length} reviews. Analyzing...`);
          agentResponse = await analyzeReviews(scrapedNicheReviews);
          if (agentResponse && agentResponse.rawJson) {
            await updateMemory(agentResponse.rawJson, intentResult.searchQuery || message);
          }
        }
        break;
      case 'competitor_analysis':
        console.log('Intent: competitor_analysis - Initiating scraping for competitor...');
        const scrapedCompetitorData = await scrapeReviews({
          searchQuery: `${intentResult.competitorName} in ${intentResult.location}`, 
          mode: "competitor",
          competitorName: intentResult.competitorName,
          location: intentResult.location,
        });

        if (scrapedCompetitorData.error) {
          agentResponse = { error: `Scraping error: ${scrapedCompetitorData.error}` };
        } else if (!scrapedCompetitorData.business_info || scrapedCompetitorData.reviews.length === 0) {
          agentResponse = { message: `No data found for competitor "${intentResult.competitorName}" in "${intentResult.location}". Please check the name and location.` };
        } else {
          console.log(`Scraped data for competitor "${intentResult.competitorName}". Analyzing...`);
          agentResponse = await analyzeCompetitor(scrapedCompetitorData);
        }
        break;
      case 'generate_content':
        if (!intentResult.contentRequest) {
          agentResponse = { error: "Please specify what content you'd like to generate." };
        } else {
          const contentData = await generateMarketingContent(intentResult.contentRequest);
          if (contentData.error) {
            agentResponse = contentData;
          } else {
            agentResponse = {
              content: contentData.content,
              formattedContent: formatGeneratedContent(contentData.content),
              intent: 'generate_content'
            };
          }
        }
        break;
      case 'other':
      default:
        agentResponse = { ...intentResult, message: "Hello! How can I help you today?" };
        break;
    }

    // --- Persist to Supabase if userId is provided ---
    let savedChat = null;
    if (userId) {
      const updatedHistory = [
        ...history,
        { role: 'user', content: message },
        { role: 'agent', content: agentResponse }
      ];

      const title = history.length === 0 ? message.substring(0, 40) : null;

      savedChat = await saveChat({
        userId,
        chatId,
        title,
        messages: updatedHistory
      });
    }

    return new Response(JSON.stringify({
      ...agentResponse,
      chatId: savedChat?.id || chatId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}