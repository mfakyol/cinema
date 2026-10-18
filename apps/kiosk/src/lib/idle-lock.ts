import { useCallback, useEffect, useState } from "react";

const KEY = "sinema.kiosk.locked";
/** The box office locks itself after this long without a touch, a click or a key. */
export const LOCK_AFTER_MS = 2 * 60_000;
const ACTIVITY = ["pointerdown", "keydown", "wheel"] as const;

function readLocked(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLocked(locked: boolean): void {
  try {
    if (locked) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the lock then lasts until the window reloads.
  }
}

/**
 * Locks on demand or after a while without activity. The flag is stored, so reloading the
 * window does not get past the lock.
 */
export function useIdleLock() {
  const [locked, setLocked] = useState(readLocked);
  const lock = useCallback(() => {
    writeLocked(true);
    setLocked(true);
  }, []);
  const unlock = useCallback(() => {
    writeLocked(false);
    setLocked(false);
  }, []);

  useEffect(() => {
    if (locked) return;
    let timer = setTimeout(lock, LOCK_AFTER_MS);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, LOCK_AFTER_MS);
    };
    ACTIVITY.forEach((name) => window.addEventListener(name, restart, { passive: true }));
    return () => {
      clearTimeout(timer);
      ACTIVITY.forEach((name) => window.removeEventListener(name, restart));
    };
  }, [locked, lock]);

  return { locked, lock, unlock };
}
