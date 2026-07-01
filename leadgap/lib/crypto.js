import crypto from "crypto";

const IV_LENGTH = 16;

function requireSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_SECRET is not set on the server. Add it in Vercel → Environment Variables."
    );
  }
  return secret;
}

function legacyKeyBuffer(secret) {
  const buf = Buffer.from(secret);
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_SECRET must be exactly 32 characters for legacy encryption. Re-save your Gemini key after updating the secret, or use any length secret with v2 encryption."
    );
  }
  return buf;
}

function v2KeyBuffer(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptWithKey(text, keyBuffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { iv, encrypted };
}

function decryptWithKey(payload, keyBuffer) {
  const iv = Buffer.from(payload.ivHex, "hex");
  const encryptedText = Buffer.from(payload.cipherHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString("utf8");
}

function parsePayload(text) {
  if (text.startsWith("v2:")) {
    const parts = text.slice(3).split(":");
    const ivHex = parts.shift();
    return { version: "v2", ivHex, cipherHex: parts.join(":") };
  }

  const parts = text.split(":");
  const ivHex = parts.shift();
  return { version: "legacy", ivHex, cipherHex: parts.join(":") };
}

export function encrypt(text) {
  const secret = requireSecret();
  const { iv, encrypted } = encryptWithKey(text, v2KeyBuffer(secret));
  return `v2:${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(text) {
  const secret = requireSecret();
  const payload = parsePayload(text);
  const keyStrategies =
    payload.version === "v2"
      ? [() => v2KeyBuffer(secret)]
      : [() => legacyKeyBuffer(secret), () => v2KeyBuffer(secret)];

  let lastError;
  for (const getKey of keyStrategies) {
    try {
      return decryptWithKey(payload, getKey());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to decrypt stored API key.");
}
