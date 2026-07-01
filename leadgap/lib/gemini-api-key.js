import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_KEY_PATTERN = /^AIza[\w-]{30,}$/;

export function normalizeGeminiApiKey(key) {
  if (key == null || typeof key !== "string") return null;
  const trimmed = key.trim();
  return trimmed || null;
}

export function isValidGeminiKeyFormat(key) {
  const normalized = normalizeGeminiApiKey(key);
  return Boolean(normalized && GEMINI_KEY_PATTERN.test(normalized));
}

/** Encrypted at rest: "v2:iv:ciphertext" or legacy "iv:ciphertext" */
export function looksEncryptedGeminiKey(value) {
  if (typeof value !== "string") return false;
  if (value.startsWith("v2:")) {
    return /^v2:[0-9a-f]+:[0-9a-f]+$/i.test(value);
  }
  return /^[0-9a-f]+:[0-9a-f]+$/i.test(value) && !value.startsWith("AIza");
}

export function looksLikePlainGeminiKey(value) {
  return isValidGeminiKeyFormat(value);
}

export async function validateGeminiApiKey(apiKey) {
  const normalized = normalizeGeminiApiKey(apiKey);
  if (!isValidGeminiKeyFormat(normalized)) {
    return {
      valid: false,
      error: "Invalid key format. Use a Google AI Studio key that starts with AIza.",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(normalized);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    await model.generateContent("Reply with OK");
    return { valid: true };
  } catch (error) {
    const message = error?.message || "Gemini API key validation failed.";
    if (message.includes("API_KEY_INVALID") || message.includes("API key not valid")) {
      return {
        valid: false,
        error:
          "Google rejected this API key. Create one at https://aistudio.google.com/apikey and ensure Generative Language API is enabled.",
      };
    }
    return { valid: false, error: message };
  }
}
