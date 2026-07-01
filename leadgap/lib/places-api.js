const PLACES_BASE = "https://places.googleapis.com/v1";

function getPlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
}

function placesHeaders(fieldMask) {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": getPlacesApiKey(),
    "X-Goog-FieldMask": fieldMask,
  };
}

function placeResourceId(placeId) {
  if (!placeId) return "";
  return placeId.startsWith("places/") ? placeId : `places/${placeId}`;
}

async function parsePlacesError(response, rawBody) {
  let detail = rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    detail = parsed?.error?.message || parsed?.message || rawBody;
  } catch {
    // keep raw text
  }
  return `Places API failed (${response.status}): ${detail}`;
}

function buildTextQuery({ searchQuery, mode, competitorName, location }) {
  if (mode === "competitor") {
    const parts = [competitorName || searchQuery];
    if (location && String(location).toLowerCase() !== "unknown location") {
      parts.push(location);
    }
    return parts.filter(Boolean).join(" ");
  }

  const parts = [searchQuery];
  if (location && String(location).trim()) {
    parts.push(location);
  }
  return parts.filter(Boolean).join(" ");
}

function normalizeReview(placeName, review) {
  const text = review?.text?.text || review?.originalText?.text || "";
  const rating = review?.rating;
  return {
    business_name: placeName,
    stars: rating ? `${rating} stars` : "unknown",
    text,
    author: review?.authorAttribution?.displayName || null,
    relative_time: review?.relativePublishTimeDescription || null,
  };
}

async function searchPlaces(textQuery, maxResults = 2) {
  const response = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: placesHeaders(
      "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount"
    ),
    body: JSON.stringify({
      textQuery,
      maxResultCount: maxResults,
      languageCode: "en",
    }),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    return { error: await parsePlacesError(response, rawBody) };
  }

  const data = rawBody ? JSON.parse(rawBody) : {};
  return { places: data.places || [] };
}

async function getPlaceDetails(placeId) {
  const resourceId = placeResourceId(placeId);
  const response = await fetch(`${PLACES_BASE}/${resourceId}`, {
    headers: placesHeaders(
      "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,userRatingCount,reviews"
    ),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    return { error: await parsePlacesError(response, rawBody) };
  }

  return rawBody ? JSON.parse(rawBody) : {};
}

/**
 * Fetch reviews via Google Places API (New).
 * Niche mode → array of { business_name, stars, text, ... }
 * Competitor mode → { business_info, reviews }
 */
export async function fetchReviewsFromPlaces({
  searchQuery,
  mode = "niche",
  competitorName,
  location,
}) {
  if (!getPlacesApiKey()) {
    return {
      error:
        "GOOGLE_PLACES_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.",
    };
  }

  const maxBusinesses = mode === "competitor" ? 1 : 2;
  const textQuery = buildTextQuery({ searchQuery, mode, competitorName, location });

  console.log("[places] text search:", textQuery, "mode:", mode);

  try {
    const searchResult = await searchPlaces(textQuery, maxBusinesses);
    if (searchResult.error) return searchResult;

    const places = searchResult.places || [];
    if (!places.length) {
      return { error: `No businesses found for "${textQuery}".` };
    }

    if (mode === "competitor") {
      const details = await getPlaceDetails(places[0].id);
      if (details.error) return details;

      const name =
        details.displayName?.text ||
        places[0].displayName?.text ||
        competitorName ||
        "Unknown";

      const reviews = (details.reviews || [])
        .map((review) => normalizeReview(name, review))
        .filter((row) => row.text);

      return {
        business_info: {
          name,
          website: details.websiteUri || "N/A",
          phone: details.nationalPhoneNumber || "N/A",
          address: details.formattedAddress || "N/A",
          rating: details.rating ?? null,
          review_count: details.userRatingCount ?? null,
        },
        reviews,
      };
    }

    const allReviews = [];
    for (const place of places.slice(0, maxBusinesses)) {
      const details = await getPlaceDetails(place.id);
      if (details.error) {
        console.error("[places] details error:", place.id, details.error);
        continue;
      }

      const name =
        details.displayName?.text ||
        place.displayName?.text ||
        "Unknown";

      for (const review of details.reviews || []) {
        const row = normalizeReview(name, review);
        if (row.text) allReviews.push(row);
      }
    }

    if (!allReviews.length) {
      return {
        error: `Found businesses for "${textQuery}" but Places API returned no review text.`,
      };
    }

    return allReviews.slice(0, 20);
  } catch (error) {
    console.error("[places] fetch error:", error);
    return { error: error.message };
  }
}
