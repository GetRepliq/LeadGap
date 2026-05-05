import { processNextQueuedJob } from "../../../../lib/agent-job-service";
import { getCorsHeaders, withCorsJson } from "../../../../lib/api-cors";

export const maxDuration = 120;

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request) {
  const token = request.headers.get("x-worker-token");
  if (!process.env.WORKER_TOKEN || token !== process.env.WORKER_TOKEN) {
    return withCorsJson(request, { error: "Unauthorized" }, 401);
  }

  try {
    const result = await processNextQueuedJob();
    return withCorsJson(request, result, 200);
  } catch (error) {
    return withCorsJson(request, { error: error.message }, 500);
  }
}
