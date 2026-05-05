import { getAgentJob } from "../../../../lib/agent-job-service";

export async function GET(_request, { params }) {
  try {
    const { jobId } = params;
    const job = await getAgentJob(jobId);

    return new Response(JSON.stringify(job), { status: 200 });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Job lookup failed" }),
      { status: 404 }
    );
  }
}
