import { classifyIntent, analyzeReviews, analyzeCompetitor, generateMarketingContent, updateMemory } from '../../../lib/agent-functions';

// Dummy data for scraping until Stage 4 is implemented
const dummyScrapedReviews = [
  { business_name: "Austin Plumbing Pro", stars: "5.0 stars", numerical_stars: 5, text: "Excellent service! Fixed my leak quickly and professionally. Highly recommend." },
  { business_name: "Austin Plumbing Pro", stars: "4.0 stars", numerical_stars: 4, text: "Good work, but took a bit longer than expected. Price was fair." },
  { business_name: "Austin Plumbing Pro", stars: "2.0 stars", numerical_stars: 2, text: "Had a terrible experience. Plumber was late and didn't fix the issue completely. Very frustrating." },
  { business_name: "Reliable Pipes Inc.", stars: "4.5 stars", numerical_stars: 4.5, text: "Always on time and very transparent with pricing. Our go-to for all plumbing needs." },
  { business_name: "Reliable Pipes Inc.", stars: "3.0 stars", numerical_stars: 3, text: "Okay service, but their communication could be better. Had to call multiple times for updates." },
  { business_name: "QuickFix Plumbing", stars: "1.0 stars", numerical_stars: 1, text: "Absolutely avoid! Overcharged and the problem came back within a week. Horrible customer service." },
  { business_name: "QuickFix Plumbing", stars: "5.0 stars", numerical_stars: 5, text: "Fast and efficient. Saved us from a major flood. Lifesavers!" },
];

const dummyCompetitorData = {
  business_info: {
    name: "Competitor Plumbing Co.",
    website: "https://www.competitorplumbing.com",
    phone: "555-123-4567",
    address: "123 Main St, Austin, TX"
  },
  reviews: [
    { business_name: "Competitor Plumbing Co.", stars: "1.0 stars", numerical_stars: 1, text: "Worst service ever. They left a huge mess and charged a fortune." },
    { business_name: "Competitor Plumbing Co.", stars: "2.0 stars", numerical_stars: 2, text: "Took forever to respond and when they did, they cancelled last minute." },
    { business_name: "Competitor Plumbing Co.", stars: "4.0 stars", numerical_stars: 4, text: "Decent work, but the scheduling was a nightmare. Always late." },
    { business_name: "Competitor Plumbing Co.", stars: "5.0 stars", numerical_stars: 5, text: "The actual plumbing work was great, but the customer service is nonexistent." },
  ]
};

export async function POST(request) {
  const { message } = await request.json();
  console.log('Received message:', message);

  try {
    const intentResult = await classifyIntent(message);
    console.log('Intent Classified:', intentResult);

    let agentResponse;

    switch (intentResult.intent) {
      case 'extract_reviews':
        // For now, use dummy data. Stage 4 will integrate actual scraping.
        const scrapedReviews = dummyScrapedReviews;
        agentResponse = await analyzeReviews(scrapedReviews);
        // Also update memory with the raw analysis (if successful)
        if (agentResponse && agentResponse.rawJson) {
            await updateMemory(agentResponse.rawJson, intentResult.searchQuery || message);
        }
        break;
      case 'competitor_analysis':
        // For now, use dummy data. Stage 4 will integrate actual scraping.
        const competitorData = dummyCompetitorData; // Or use intentResult.competitorName/location
        agentResponse = await analyzeCompetitor(competitorData);
        break;
      case 'generate_content':
        if (!intentResult.contentRequest) {
          agentResponse = { error: "Please specify what content you'd like to generate." };
        } else {
          agentResponse = await generateMarketingContent(intentResult.contentRequest);
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