import { classifyIntent } from '../../../lib/agent-functions'; // Adjust path as needed

export async function POST(request) {
  const { message } = await request.json();
  console.log('Received message:', message);

  try {
    const intentResult = await classifyIntent(message);
    return new Response(JSON.stringify(intentResult), {
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