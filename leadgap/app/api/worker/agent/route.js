import { processNextQueuedJob } from "../../../../lib/agent-job-service";

export const maxDuration = 120;

export async function POST(request) {
  const token = request.headers.get("x-worker-token");
  if (!process.env.WORKER_TOKEN || token !== process.env.WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const result = await processNextQueuedJob();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
