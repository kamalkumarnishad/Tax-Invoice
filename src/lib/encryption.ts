import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/config/env";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  if (env.ENCRYPTION_KEY) return Buffer.from(env.ENCRYPTION_KEY, "base64");
  // Development only: env validation requires the key in production.
  return createHash("sha256").update("development-only-encryption-key").digest();
}

/**
 * AES-256-GCM. `context` (for example the owner's id) is authenticated, so a
 * ciphertext copied to another user's row fails to decrypt.
 */
export function encrypt(plaintext: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv).setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function decrypt(ciphertext: string, context: string): string {
  const [version, payload] = ciphertext.split(".");
  if (version !== VERSION || !payload) throw new Error("Unknown ciphertext format");
  const data = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES })
    .setAAD(Buffer.from(context))
    .setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
}
