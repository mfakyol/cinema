import { createHash, randomBytes } from "node:crypto";
import type { LockPin } from "@sinema/shared";

/**
 * A staff member's box-office lock PIN. The box office unlocks without a server round trip, so
 * at sign-in it receives this salted SHA-256 digest and checks typed PINs against it. The PIN
 * only unlocks a session that is already signed in, which is why a fast digest is enough here,
 * unlike the account password.
 */
export function lockPinFor(pin: string): LockPin {
  const salt = randomBytes(16).toString("hex");
  return { salt, digest: createHash("sha256").update(`${salt}:${pin}`).digest("hex") };
}

/** The stored columns as sent to the box office; null when no PIN is set. */
export function storedLockPin(user: { lockPinSalt: string | null; lockPinDigest: string | null }): LockPin | null {
  return user.lockPinSalt && user.lockPinDigest ? { salt: user.lockPinSalt, digest: user.lockPinDigest } : null;
}
