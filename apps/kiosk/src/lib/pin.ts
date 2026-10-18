import type { LockPin } from "@sinema/shared";

/**
 * The signed-in staff member's box-office lock PIN, as the API sends it at sign-in: a salt and
 * the SHA-256 digest of `${salt}:${pin}`. Typed PINs are checked against it here, so unlocking
 * needs no server round trip. Removed on sign-out.
 */
const KEY = "sinema.kiosk.pin";

/** Lock PINs are always six digits. */
export const PIN_LENGTH = 6;

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function read(): LockPin | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LockPin) : null;
  } catch {
    return null;
  }
}

export function storeLockPin(lockPin: LockPin | null | undefined): void {
  try {
    if (lockPin) window.localStorage.setItem(KEY, JSON.stringify(lockPin));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the PIN screen asks again after a reload.
  }
}

export const hasLockPin = (): boolean => read() !== null;

export async function checkPin(pin: string): Promise<boolean> {
  const stored = read();
  if (!stored) return false;
  const digest = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${stored.salt}:${pin}`)));
  return digest === stored.digest;
}
