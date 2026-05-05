import { getAgentJob } from "../../../../lib/agent-job-service";
import { getCorsHeaders, withCorsJson } from "../../../../lib/api-cors";

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request, { params } = {}) {
  try {
    const jobIdFromParams = params?.jobId;
    const jobIdFromUrl = new URL(request.url).pathname.split("/").pop();
    const jobId = jobIdFromParams || jobIdFromUrl;

    if (!jobId || jobId === "undefined") {
      return withCorsJson(request, { error: "Missing jobId" }, 400);
    }

    const job = await getAgentJob(jobId);
    return withCorsJson(request, job, 200);
  } catch (error) {
    return withCorsJson(request, { error: error.message || "Job lookup failed" }, 404);
  }
}