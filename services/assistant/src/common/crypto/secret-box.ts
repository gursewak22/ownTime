import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Symmetric encryption-at-rest for user-supplied Anthropic API keys.
// The cipher key is derived from ASSISTANT_KEY_SECRET so the env value can be
// any length; the stored form is base64(iv | authTag | ciphertext).

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function cipherKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', cipherKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function open(sealed: string, secret: string): string {
  const raw = Buffer.from(sealed, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
