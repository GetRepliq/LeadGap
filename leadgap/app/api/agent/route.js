import { classifyIntent, analyzeReviews, analyzeCompetitor, generateMarketingContent, updateMemory, scrapeReviews, formatGeneratedContent } from '../../../lib/agent-functions';


export async function POST(request) {
  const { message } = await request.json();
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
          // Also update memory with the raw analysis (if successful)
          if (agentResponse && agentResponse.rawJson) {
            await updateMemory(agentResponse.rawJson, intentResult.searchQuery || message);
          }
        }
        break;
      case 'competitor_analysis':
        console.log('Intent: competitor_analysis - Initiating scraping for competitor...');
        const scrapedCompetitorData = await scrapeReviews({
          searchQuery: `${intentResult.competitorName} in ${intentResult.location}`, // Python script expects this format for the query argument
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
        agentResponse = { ...intentResult, message: "Hello! How can I help you today?" }; // Provide a default friendly message
        break;
    }

    return new Response(JSON.stringify(agentResponse), {
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