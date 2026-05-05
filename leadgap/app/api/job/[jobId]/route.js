import { getAgentJob } from "../../../../lib/agent-job-service";
import { getCorsHeaders, withCorsJson } from "../../../../lib/api-cors";

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request, { params }) {
  const { jobId } = params ?? {};
  console.info(`[job] GET ${new URL(request.url).pathname} — jobId: ${jobId}`);

  if (!jobId) {
    return withCorsJson(request, { error: "Missing jobId" }, 400);
  }

  try {
    const job = await getAgentJob(jobId);
    return withCorsJson(request, job, 200);
  } catch (error) {
    return withCorsJson(request, { error: error.message || "Job lookup failed" }, 404);
  }
}
