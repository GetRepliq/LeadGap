import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET; // Must be 32 characters
const IV_LENGTH = 16; // For AES, this is always 16

export function encrypt(text) {
  if (!ENCRYPTION_KEY) throw new Error("Encryption key not found.");
  
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);

  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text) {
  if (!ENCRYPTION_KEY) throw new Error("Encryption key not found.");

  let textParts = text.split(':');
  let iv = Buffer.from(textParts.shift(), 'hex');
  let encryptedText = Buffer.from(textParts.join(':'), 'hex');
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);

  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}
