import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

function sign(body: string): string {
  return createHmac("sha256", env.QR_SECRET).update(body).digest("base64url").slice(0, 22);
}

/** A random ticket token with an HMAC suffix, so forged codes fail before any lookup. */
export function createQrToken(): string {
  const body = randomBytes(18).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function hasValidSignature(token: string): boolean {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return false;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
