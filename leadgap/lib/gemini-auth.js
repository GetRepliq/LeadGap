import { createClient } from "@supabase/supabase-js";
import { decrypt } from "./crypto";
import {
  looksEncryptedGeminiKey,
  looksLikePlainGeminiKey,
  normalizeGeminiApiKey,
} from "./gemini-api-key";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_PRIVATE_SERVICE_ROLE
);

function resolveStoredKey(stored) {
  if (looksLikePlainGeminiKey(stored)) {
    return normalizeGeminiApiKey(stored);
  }

  if (looksEncryptedGeminiKey(stored)) {
    return normalizeGeminiApiKey(decrypt(stored));
  }

  throw new Error(
    "Stored Gemini API key is in an unrecognized format. Open Terminal Activation and re-enter your key."
  );
}

export async function getActiveApiKey(userId) {
  const envKey = normalizeGeminiApiKey(process.env.GEMINI_API_KEY);

  if (!userId) return envKey;

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("gemini_api_key")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Could not load profile: ${error.message}`);
  }

  const stored = profile?.gemini_api_key;
  if (!stored) {
    if (envKey) return envKey;
    throw new Error(
      "No Gemini API key found. Add your key via Terminal Activation or set GEMINI_API_KEY on the server."
    );
  }

  try {
    const userKey = resolveStoredKey(stored);
    if (!userKey) {
      throw new Error("Stored Gemini API key is empty after decryption.");
    }
    return userKey;
  } catch (error) {
    if (error.message?.includes("ENCRYPTION_SECRET")) throw error;
    throw new Error(
      `Could not read your saved Gemini API key (${error.message}). Re-enter it via Terminal Activation. If this persists, verify ENCRYPTION_SECRET is set and unchanged on the server.`
    );
  }
}
