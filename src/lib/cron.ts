import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compared as hashes of equal length, so the time taken says nothing about the secret. */
export function isCronRequest(request: Request, secret: string | undefined): boolean {
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
