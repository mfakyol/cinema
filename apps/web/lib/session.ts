"use client";

import { useSyncExternalStore } from "react";
import type { User } from "./api";

/** The signed-in customer, kept in localStorage so it survives reloads. */
export interface Session {
  token: string;
  user: User;
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

/** The current session; null on the server and while signed out. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
