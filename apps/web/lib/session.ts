"use client";

import { useSyncExternalStore } from "react";
import { postJson, type User } from "./api";

/**
 * Who is buying, kept in localStorage so it survives reloads. Customers do not need an
 * account: a guest session has a token but no user, and still sees its own tickets here.
 */
export interface Session {
  token: string;
  user: User | null;
}

const STORAGE_KEY = "sinema.session";
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;

function read(): Session | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  // Return the same object while storage is unchanged, as useSyncExternalStore requires.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cachedSession = null;
    }
  }
  return cachedSession;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setSession(session: Session | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export function getSessionToken(): string | undefined {
  return read()?.token;
}

let guestRequest: Promise<string> | undefined;

/** The current token, starting a guest session first when there is none. */
export async function ensureSessionToken(): Promise<string> {
  const existing = getSessionToken();
  if (existing) return existing;
  // One guest session even when several seats are tapped at once.
  guestRequest ??= postJson<{ token: string }>("/auth/guest", { channel: "WEB" })
    .then(({ token }) => {
      setSession({ token, user: null });
      return token;
    })
    .finally(() => {
      guestRequest = undefined;
    });
  return guestRequest;
}

/** The current session; null on the server and before anything was bought or signed in. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

const never = () => () => {};

/** False during the server render and hydration, before the stored session can be read. */
export function useSessionKnown(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}
