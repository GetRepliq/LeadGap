import { getCorsHeaders, withCorsJson } from "../../../lib/api-cors";

export async function GET(request) {
  return withCorsJson(request, {
    ok: true,
    backend: "leadgap-next-api",
    reviews: "google-places-api-v1",
    config: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      encryption: Boolean(process.env.ENCRYPTION_SECRET),
      googlePlaces: Boolean(
        process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
      ),
      supabase: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.SUPABASE_PRIVATE_SERVICE_ROLE
      ),
      worker: Boolean(process.env.WORKER_TOKEN),
    },
  });
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}
